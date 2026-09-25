import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as QRCode from "qrcode";
import {
  RestaurantFulfillment,
  RestaurantInvoiceRequestStatus,
  RestaurantItemStatus,
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  RestaurantStation,
  RestaurantTableKind,
  RestaurantVisitStatus,
  UserRole,
} from "../generated/prisma/enums";
import {
  CreateMenuItemDto,
  CreatePromotionDto,
  CreateTableDto,
  PlaceOrderDto,
  RequestInvoiceDto,
  UpdateItemStatusDto,
  UpdateItemFulfillmentDto,
  UpdateInvoiceRequestDto,
  UpdateMenuItemDto,
  UpdateRestaurantBillingDto,
  UpdateStaffAvailabilityDto,
  UpdateTableBillingDto,
  UpdatePromotionDto,
} from "./dto/restaurant.dto";
import type { Prisma } from "../generated/prisma/client";

const transitions: Record<RestaurantItemStatus, RestaurantItemStatus[]> = {
  RECEIVED: [RestaurantItemStatus.ACCEPTED, RestaurantItemStatus.CANCELLED],
  ACCEPTED: [RestaurantItemStatus.PREPARING, RestaurantItemStatus.CANCELLED],
  PREPARING: [RestaurantItemStatus.READY, RestaurantItemStatus.CANCELLED],
  READY: [RestaurantItemStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

export type RestaurantActor = {
  id: string;
  organizationId: string;
  role: UserRole;
  restaurantRole: RestaurantStaffRole | null;
  restaurantAvailability: RestaurantStaffAvailability;
};

@Injectable()
export class RestaurantService {
  constructor(private readonly prisma: PrismaService) {}

  private effectiveRole(actor: RestaurantActor) {
    if (actor.role === UserRole.OWNER || actor.role === UserRole.ADMIN) {
      return RestaurantStaffRole.RESTAURANT_ADMIN;
    }
    return actor.restaurantRole;
  }

  private requireRestaurantAdmin(actor: RestaurantActor) {
    if (this.effectiveRole(actor) !== RestaurantStaffRole.RESTAURANT_ADMIN) {
      throw new ForbiddenException("Restaurant administrator access required");
    }
  }

  private async rebalanceWaiterTables(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const [tables, waiters] = await Promise.all([
      tx.restaurantTable.findMany({
        where: {
          organizationId,
          active: true,
          kind: RestaurantTableKind.DINING,
        },
        select: { id: true, name: true, waiterId: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      tx.user.findMany({
        where: {
          organizationId,
          restaurantRole: RestaurantStaffRole.WAITER,
          restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
        },
        select: { id: true, name: true, updatedAt: true },
        orderBy: [{ updatedAt: "asc" }, { name: "asc" }, { id: "asc" }],
      }),
    ]);

    if (!waiters.length) {
      await tx.restaurantTable.updateMany({
        where: { id: { in: tables.map((table) => table.id) } },
        data: { waiterId: null },
      });
      return {
        reassignments: [],
        unassignedTables: tables.map(({ id, name }) => ({ id, name })),
      };
    }

    const base = Math.floor(tables.length / waiters.length);
    const remainder = tables.length % waiters.length;
    const target = new Map(
      waiters.map((waiter, index) => [
        waiter.id,
        base + (index < remainder ? 1 : 0),
      ]),
    );
    const retained = new Map(waiters.map((waiter) => [waiter.id, 0]));
    const pending: typeof tables = [];
    for (const table of tables) {
      const limit = table.waiterId ? target.get(table.waiterId) : undefined;
      const count = table.waiterId ? (retained.get(table.waiterId) ?? 0) : 0;
      if (table.waiterId && limit !== undefined && count < limit) {
        retained.set(table.waiterId, count + 1);
      } else {
        pending.push(table);
      }
    }

    const reassignments: Array<{
      tableId: string;
      tableName: string;
      waiterId: string;
      waiterName: string;
    }> = [];
    for (const table of pending) {
      const waiter = waiters.find(
        (candidate) =>
          (retained.get(candidate.id) ?? 0) < (target.get(candidate.id) ?? 0),
      );
      if (!waiter) continue;
      if (table.waiterId !== waiter.id) {
        await tx.restaurantTable.update({
          where: { id: table.id },
          data: { waiterId: waiter.id },
        });
        reassignments.push({
          tableId: table.id,
          tableName: table.name,
          waiterId: waiter.id,
          waiterName: waiter.name,
        });
      }
      retained.set(waiter.id, (retained.get(waiter.id) ?? 0) + 1);
    }
    return { reassignments, unassignedTables: [] };
  }

  async profile(actor: RestaurantActor) {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, organizationId: actor.organizationId },
      select: { name: true },
    });
    if (!user) throw new NotFoundException("User not found");
    return {
      id: actor.id,
      name: user.name,
      organizationId: actor.organizationId,
      restaurantRole: this.effectiveRole(actor),
      restaurantAvailability: actor.restaurantAvailability,
    };
  }

  tables(actor: RestaurantActor) {
    const role = this.effectiveRole(actor);
    if (!role) throw new ForbiddenException("Restaurant role required");
    return this.prisma.restaurantTable.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(role === RestaurantStaffRole.WAITER ? { waiterId: actor.id } : {}),
      },
      include: {
        waiter: { select: { id: true, name: true, email: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async addTable(actor: RestaurantActor, dto: CreateTableDto) {
    this.requireRestaurantAdmin(actor);
    const organizationId = actor.organizationId;
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("Table name required");
    const existing = await this.prisma.restaurantTable.findFirst({
      where: { organizationId, name },
    });
    if (existing) throw new ConflictException("Table already exists");
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.restaurantTable.create({
        data: {
          organizationId,
          name,
          kind: dto.kind ?? RestaurantTableKind.DINING,
          serviceChargeEnabled:
            (dto.kind ?? RestaurantTableKind.DINING) ===
            RestaurantTableKind.DINING,
        },
      });
      if (created.kind === RestaurantTableKind.DINING) {
        await this.rebalanceWaiterTables(tx, organizationId);
      }
      return created;
    });
  }

  async assignWaiter(
    actor: RestaurantActor,
    tableId: string,
    waiterId: string | null,
  ) {
    this.requireRestaurantAdmin(actor);
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id: tableId, organizationId: actor.organizationId },
    });
    if (!table) throw new NotFoundException("Table not found");
    if (waiterId) {
      const waiter = await this.prisma.user.findFirst({
        where: {
          id: waiterId,
          organizationId: actor.organizationId,
          restaurantRole: RestaurantStaffRole.WAITER,
        },
      });
      if (!waiter)
        throw new BadRequestException("Selected user is not a waiter");
    }
    return this.prisma.restaurantTable.update({
      where: { id: tableId },
      data: { waiterId },
      include: { waiter: { select: { id: true, name: true, email: true } } },
    });
  }

  billingSettings(actor: RestaurantActor) {
    this.requireRestaurantAdmin(actor);
    return this.prisma.organization.findUnique({
      where: { id: actor.organizationId },
      select: {
        restaurantTaxRateBps: true,
        restaurantTaxIncluded: true,
        restaurantServiceRateBps: true,
      },
    });
  }

  updateBillingSettings(
    actor: RestaurantActor,
    dto: UpdateRestaurantBillingDto,
  ) {
    this.requireRestaurantAdmin(actor);
    return this.prisma.organization.update({
      where: { id: actor.organizationId },
      data: {
        restaurantTaxRateBps: dto.taxRateBps,
        restaurantTaxIncluded: dto.taxIncluded,
        restaurantServiceRateBps: dto.serviceRateBps,
      },
      select: {
        restaurantTaxRateBps: true,
        restaurantTaxIncluded: true,
        restaurantServiceRateBps: true,
      },
    });
  }

  async updateTableBilling(
    actor: RestaurantActor,
    tableId: string,
    dto: UpdateTableBillingDto,
  ) {
    this.requireRestaurantAdmin(actor);
    const result = await this.prisma.restaurantTable.updateMany({
      where: { id: tableId, organizationId: actor.organizationId },
      data: { serviceChargeEnabled: dto.serviceChargeEnabled },
    });
    if (!result.count) throw new NotFoundException("Table not found");
    return this.prisma.restaurantTable.findUnique({ where: { id: tableId } });
  }

  restaurantUsers(actor: RestaurantActor) {
    this.requireRestaurantAdmin(actor);
    return this.prisma.user.findMany({
      where: { organizationId: actor.organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        restaurantRole: true,
        restaurantAvailability: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async updateRestaurantRole(
    actor: RestaurantActor,
    userId: string,
    role: RestaurantStaffRole | null,
  ) {
    this.requireRestaurantAdmin(actor);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId },
    });
    if (!user) throw new NotFoundException("User not found");
    return this.prisma.$transaction(async (tx) => {
      if (role !== RestaurantStaffRole.WAITER) {
        await tx.restaurantTable.updateMany({
          where: { organizationId: actor.organizationId, waiterId: userId },
          data: { waiterId: null },
        });
      }
      const updated = await tx.user.update({
        where: { id: userId },
        data: { restaurantRole: role },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          restaurantRole: true,
          restaurantAvailability: true,
        },
      });
      await this.rebalanceWaiterTables(tx, actor.organizationId);
      return updated;
    });
  }

  async updateStaffAvailability(
    actor: RestaurantActor,
    userId: string,
    dto: UpdateStaffAvailabilityDto,
  ) {
    this.requireRestaurantAdmin(actor);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId },
      select: { id: true, restaurantRole: true },
    });
    if (!user) throw new NotFoundException("User not found");
    const reason = dto.reason?.trim() || null;
    if (dto.availability !== RestaurantStaffAvailability.AVAILABLE && !reason) {
      throw new BadRequestException(
        "Reason required when staff is unavailable",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { restaurantAvailability: dto.availability },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          restaurantRole: true,
          restaurantAvailability: true,
        },
      });
      await tx.restaurantStaffEvent.create({
        data: {
          organizationId: actor.organizationId,
          userId,
          actorId: actor.id,
          availability: dto.availability,
          reason,
        },
      });
      const balance = await this.rebalanceWaiterTables(
        tx,
        actor.organizationId,
      );
      return { staff: updated, ...balance };
    });
  }

  async updateOwnStaffAvailability(
    actor: RestaurantActor,
    dto: UpdateStaffAvailabilityDto,
  ) {
    if (!actor.restaurantRole) {
      throw new ForbiddenException("Restaurant role required");
    }
    const reason = dto.reason?.trim() || null;
    if (dto.availability !== RestaurantStaffAvailability.AVAILABLE && !reason) {
      throw new BadRequestException(
        "Reason required when staff is unavailable",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: actor.id, organizationId: actor.organizationId },
        select: { id: true, restaurantRole: true },
      });
      if (!user?.restaurantRole) {
        throw new ForbiddenException("Restaurant role required");
      }

      const updated = await tx.user.update({
        where: { id: actor.id },
        data: { restaurantAvailability: dto.availability },
        select: {
          id: true,
          name: true,
          email: true,
          restaurantRole: true,
          restaurantAvailability: true,
        },
      });
      await tx.restaurantStaffEvent.create({
        data: {
          organizationId: actor.organizationId,
          userId: actor.id,
          actorId: actor.id,
          availability: dto.availability,
          reason,
        },
      });

      const balance =
        user.restaurantRole === RestaurantStaffRole.WAITER
          ? await this.rebalanceWaiterTables(tx, actor.organizationId)
          : { reassignments: [], unassignedTables: [] };

      return { staff: updated, ...balance };
    });
  }

  async cancelOrder(actor: RestaurantActor, orderId: string, reason: string) {
    this.requireRestaurantAdmin(actor);
    const note = reason.trim();
    if (!note) throw new BadRequestException("Cancellation reason required");
    const openStatuses: RestaurantItemStatus[] = [
      RestaurantItemStatus.RECEIVED,
      RestaurantItemStatus.ACCEPTED,
      RestaurantItemStatus.PREPARING,
      RestaurantItemStatus.READY,
    ];
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.restaurantOrder.findFirst({
        where: { id: orderId, organizationId: actor.organizationId },
        include: { items: { where: { status: { in: openStatuses } } } },
      });
      if (!order) throw new NotFoundException("Order not found");
      for (const item of order.items) {
        await tx.restaurantOrderItem.update({
          where: { id: item.id },
          data: { status: RestaurantItemStatus.CANCELLED },
        });
        await tx.restaurantItemEvent.create({
          data: {
            itemId: item.id,
            actorId: actor.id,
            status: RestaurantItemStatus.CANCELLED,
            note,
          },
        });
      }
      return { id: orderId, cancelledItems: order.items.length };
    });
  }

  async closeVisit(actor: RestaurantActor, visitId: string) {
    const role = this.effectiveRole(actor);
    const visit = await this.prisma.restaurantVisit.findFirst({
      where: { id: visitId, organizationId: actor.organizationId },
      include: {
        table: { select: { waiterId: true } },
        orders: {
          select: { items: { select: { status: true } } },
        },
      },
    });
    if (!visit) throw new NotFoundException("Restaurant account not found");
    const isAdmin = role === RestaurantStaffRole.RESTAURANT_ADMIN;
    const isAssignedWaiter =
      role === RestaurantStaffRole.WAITER &&
      visit.table.waiterId === actor.id &&
      actor.restaurantAvailability === RestaurantStaffAvailability.AVAILABLE;
    if (!isAdmin && !isAssignedWaiter) {
      throw new ForbiddenException(
        "Only the assigned waiter can close this account",
      );
    }
    const hasOpenItems = visit.orders.some((order) =>
      order.items.some(
        (item) =>
          item.status !== RestaurantItemStatus.DELIVERED &&
          item.status !== RestaurantItemStatus.CANCELLED,
      ),
    );
    if (hasOpenItems) {
      throw new ConflictException("Deliver or cancel all items before closing");
    }
    return this.prisma.restaurantVisit.update({
      where: { id: visitId },
      data: { status: RestaurantVisitStatus.CLOSED, closedAt: new Date() },
    });
  }

  private async availableStations(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        restaurantRole: {
          in: [RestaurantStaffRole.KITCHEN, RestaurantStaffRole.BAR],
        },
        restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
      },
      select: { restaurantRole: true },
    });
    return new Set(users.map((user) => user.restaurantRole));
  }

  async tableQr(actor: RestaurantActor, id: string) {
    this.requireRestaurantAdmin(actor);
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!table) throw new NotFoundException("Table not found");
    const configured = process.env.PUBLIC_WEB_URL?.trim();
    if (process.env.NODE_ENV === "production" && !configured) {
      throw new BadRequestException(
        "PUBLIC_WEB_URL must use the public web domain",
      );
    }
    const base = (configured ?? "http://localhost:3001").replace(/\/$/, "");
    let publicUrl: URL;
    try {
      publicUrl = new URL(base);
    } catch {
      throw new BadRequestException("PUBLIC_WEB_URL is invalid");
    }
    if (
      process.env.NODE_ENV === "production" &&
      publicUrl.hostname.endsWith(".vercel.app") &&
      publicUrl.hostname.includes("-git-")
    ) {
      throw new BadRequestException(
        "PUBLIC_WEB_URL points to a protected Vercel preview; configure a public production domain",
      );
    }
    const url = `${base}/restaurant/table/${table.code}`;
    return {
      url,
      image: await QRCode.toDataURL(url, { width: 400, margin: 2 }),
    };
  }

  menu(actor: RestaurantActor) {
    this.requireRestaurantAdmin(actor);
    return this.prisma.restaurantMenuItem.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  private validateProductImage(imageData?: string | null) {
    if (!imageData) return null;
    const match = imageData.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match) {
      throw new BadRequestException("Image must be JPEG, PNG or WebP");
    }
    const bytes = Buffer.byteLength(match[2], "base64");
    if (bytes > 2 * 1024 * 1024) {
      throw new BadRequestException("Image exceeds the 2 MB trial limit");
    }
    const buffer = Buffer.from(match[2], "base64");
    const dimensions = this.productImageDimensions(buffer, match[1]);
    if (!dimensions) throw new BadRequestException("Invalid image data");
    if (dimensions.width > 1600 || dimensions.height > 1600) {
      throw new BadRequestException(
        "Image resolution exceeds the 1600 x 1600 trial limit",
      );
    }
    return imageData;
  }

  private productImageDimensions(buffer: Buffer, mime: string) {
    if (mime === "image/png") {
      if (
        buffer.length < 24 ||
        buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
      ) {
        return null;
      }
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }
    if (mime === "image/jpeg") {
      if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        return null;
      }
      let offset = 2;
      const sof = new Set([
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ]);
      while (offset + 8 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        if (sof.has(marker)) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7),
          };
        }
        const length = buffer.readUInt16BE(offset + 2);
        if (length < 2) return null;
        offset += length + 2;
      }
      return null;
    }
    if (
      mime === "image/webp" &&
      buffer.length >= 30 &&
      buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP"
    ) {
      const chunk = buffer.subarray(12, 16).toString();
      if (chunk === "VP8X") {
        return {
          width: buffer.readUIntLE(24, 3) + 1,
          height: buffer.readUIntLE(27, 3) + 1,
        };
      }
      if (chunk === "VP8 " && buffer.length >= 30) {
        return {
          width: buffer.readUInt16LE(26) & 0x3fff,
          height: buffer.readUInt16LE(28) & 0x3fff,
        };
      }
      if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
        return {
          width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
          height:
            1 +
            (buffer[22] >> 6) +
            (buffer[23] << 2) +
            ((buffer[24] & 0x0f) << 10),
        };
      }
    }
    return null;
  }

  addMenuItem(actor: RestaurantActor, dto: CreateMenuItemDto) {
    this.requireRestaurantAdmin(actor);
    if (!dto.name.trim()) throw new BadRequestException("Item name required");
    const productType = dto.productType.trim();
    if (!productType) throw new BadRequestException("Product type required");
    if (dto.origin === "HOUSE_MADE" && !dto.prepMinutes) {
      throw new BadRequestException(
        "Preparation time required for house-made products",
      );
    }
    return this.prisma.restaurantMenuItem.create({
      data: {
        ...dto,
        name: dto.name.trim(),
        productType,
        categories: [
          ...new Set(
            dto.categories?.map((value) => value.trim()).filter(Boolean) ?? [],
          ),
        ],
        imageData: this.validateProductImage(dto.imageData),
        organizationId: actor.organizationId,
      },
    });
  }

  async updateMenuItem(
    actor: RestaurantActor,
    id: string,
    dto: UpdateMenuItemDto,
  ) {
    this.requireRestaurantAdmin(actor);
    const data = {
      ...dto,
      ...(dto.productType !== undefined
        ? { productType: dto.productType.trim() }
        : {}),
      ...(dto.categories !== undefined
        ? {
            categories: [
              ...new Set(
                dto.categories.map((value) => value.trim()).filter(Boolean),
              ),
            ],
          }
        : {}),
      ...(dto.imageData !== undefined
        ? { imageData: this.validateProductImage(dto.imageData) }
        : {}),
    };
    if (data.productType === "") {
      throw new BadRequestException("Product type required");
    }
    const result = await this.prisma.restaurantMenuItem.updateMany({
      where: { id, organizationId: actor.organizationId },
      data,
    });
    if (!result.count) throw new NotFoundException("Menu item not found");
    return this.prisma.restaurantMenuItem.findUnique({ where: { id } });
  }

  async deleteMenuItem(actor: RestaurantActor, id: string) {
    this.requireRestaurantAdmin(actor);
    const item = await this.prisma.restaurantMenuItem.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException("Menu item not found");
    const historicalOrders = await this.prisma.restaurantOrderItem.count({
      where: { menuItemId: id },
    });
    if (historicalOrders > 0) {
      throw new ConflictException(
        "This product has order history and must be archived instead",
      );
    }
    await this.prisma.restaurantMenuItem.delete({ where: { id } });
    return { deleted: true };
  }

  promotions(actor: RestaurantActor) {
    this.requireRestaurantAdmin(actor);
    return this.prisma.restaurantPromotion.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    });
  }

  addPromotion(actor: RestaurantActor, dto: CreatePromotionDto) {
    this.requireRestaurantAdmin(actor);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException("Promotion end must follow its start");
    }
    if (!dto.productType?.trim() && !dto.menuItemId) {
      throw new BadRequestException("Promotion target required");
    }
    return this.prisma.restaurantPromotion.create({
      data: {
        organizationId: actor.organizationId,
        createdById: actor.id,
        title: dto.title.trim(),
        productType: dto.productType?.trim() || null,
        menuItemId: dto.menuItemId ?? null,
        creditAmount: dto.creditAmount,
        startsAt,
        endsAt,
      },
    });
  }

  async updatePromotion(
    actor: RestaurantActor,
    id: string,
    dto: UpdatePromotionDto,
  ) {
    this.requireRestaurantAdmin(actor);
    const current = await this.prisma.restaurantPromotion.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!current) throw new NotFoundException("Promotion not found");
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException("Promotion end must follow its start");
    }
    return this.prisma.restaurantPromotion.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startsAt ? { startsAt } : {}),
        ...(dto.endsAt ? { endsAt } : {}),
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.productType !== undefined
          ? { productType: dto.productType?.trim() || null }
          : {}),
      },
    });
  }

  invoiceRequests(actor: RestaurantActor) {
    this.requireRestaurantAdmin(actor);
    return this.prisma.restaurantVisit.findMany({
      where: {
        organizationId: actor.organizationId,
        invoiceRequestStatus: {
          not: RestaurantInvoiceRequestStatus.NOT_REQUESTED,
        },
      },
      include: { table: { select: { name: true } } },
      orderBy: { invoiceRequestedAt: "desc" },
    });
  }

  async updateInvoiceRequest(
    actor: RestaurantActor,
    id: string,
    dto: UpdateInvoiceRequestDto,
  ) {
    this.requireRestaurantAdmin(actor);
    const result = await this.prisma.restaurantVisit.updateMany({
      where: { id, organizationId: actor.organizationId },
      data: {
        invoiceRequestStatus: dto.status,
        invoiceReference: dto.reference?.trim() || null,
      },
    });
    if (!result.count) throw new NotFoundException("Invoice request not found");
    return this.prisma.restaurantVisit.findUnique({ where: { id } });
  }

  async requestInvoice(accessCode: string, dto: RequestInvoiceDto) {
    const result = await this.prisma.restaurantVisit.updateMany({
      where: { accessCode },
      data: {
        invoiceRequestStatus: RestaurantInvoiceRequestStatus.PENDING,
        invoiceRequestedAt: new Date(),
        invoiceName: dto.name.trim(),
        invoiceEmail: dto.email.trim().toLowerCase(),
        invoicePhone: dto.phone.trim(),
        invoiceTaxId: dto.taxId.trim(),
      },
    });
    if (!result.count) throw new NotFoundException("Account not found");
    return { status: RestaurantInvoiceRequestStatus.PENDING };
  }

  async guestMenu(code: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { code },
      include: {
        organization: {
          select: {
            name: true,
            restaurantTaxRateBps: true,
            restaurantTaxIncluded: true,
            restaurantServiceRateBps: true,
          },
        },
        waiter: { select: { id: true, name: true } },
      },
    });
    if (!table?.active) throw new NotFoundException("Table not found");
    const availableStations = await this.availableStations(
      table.organizationId,
    );
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const [menu, recentOrders, activeAccountCount, promotions] =
      await Promise.all([
        this.prisma.restaurantMenuItem.findMany({
          where: {
            organizationId: table.organizationId,
            active: true,
          },
          orderBy: { createdAt: "asc" },
        }),
        this.prisma.restaurantOrder.findMany({
          where: {
            organizationId: table.organizationId,
            createdAt: { gte: since },
          },
          select: {
            items: {
              where: { status: { not: RestaurantItemStatus.CANCELLED } },
              select: { menuItem: { select: { productType: true } } },
            },
          },
        }),
        this.prisma.restaurantVisit.count({
          where: { tableId: table.id, status: RestaurantVisitStatus.OPEN },
        }),
        this.prisma.restaurantPromotion.findMany({
          where: {
            organizationId: table.organizationId,
            active: true,
            startsAt: { lte: now },
            endsAt: { gt: now },
          },
          orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
        }),
      ]);
    const popularity = new Map<string, number>();
    for (const order of recentOrders) {
      const types = new Set(
        order.items.map((item) => item.menuItem.productType),
      );
      for (const type of types) {
        popularity.set(type, (popularity.get(type) ?? 0) + 1);
      }
    }
    const productTypes = [
      ...new Set(menu.map((item) => item.productType)),
    ].sort(
      (left, right) =>
        (popularity.get(right) ?? 0) - (popularity.get(left) ?? 0) ||
        left.localeCompare(right),
    );
    return {
      restaurant: table.organization.name,
      table: table.name,
      tableKind: table.kind,
      activeAccountCount,
      waiter: table.waiter,
      billing: {
        taxRateBps: table.organization.restaurantTaxRateBps,
        taxIncluded: table.organization.restaurantTaxIncluded,
        serviceRateBps: table.organization.restaurantServiceRateBps,
        serviceChargeEnabled: table.serviceChargeEnabled,
      },
      productTypes,
      promotions: promotions
        .map((promotion) => ({
          ...promotion,
          menuItem:
            menu.find(
              (item) =>
                (promotion.menuItemId
                  ? item.id === promotion.menuItemId
                  : item.productType === promotion.productType) &&
                (item.station === RestaurantStation.KITCHEN
                  ? availableStations.has(RestaurantStaffRole.KITCHEN)
                  : availableStations.has(RestaurantStaffRole.BAR)),
            ) ?? null,
        }))
        .filter((promotion) => promotion.menuItem !== null),
      menu: menu.map((item) => ({
        ...item,
        available:
          item.station === RestaurantStation.KITCHEN
            ? availableStations.has(RestaurantStaffRole.KITCHEN)
            : availableStations.has(RestaurantStaffRole.BAR),
      })),
    };
  }

  async placeOrder(code: string, dto: PlaceOrderDto) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { code },
    });
    if (!table?.active) throw new NotFoundException("Table not found");
    const include = {
      items: true,
      table: { select: { name: true } },
      visit: { select: { accessCode: true } },
    } as const;
    const previous = await this.prisma.restaurantOrder.findUnique({
      where: { requestId: dto.requestId },
      include,
    });
    if (previous) {
      if (previous.tableId !== table.id)
        throw new ConflictException("Request already used");
      return {
        ...previous,
        accessCode: previous.visit?.accessCode ?? previous.accessCode,
      };
    }
    const ids = dto.items.map((item) => item.menuItemId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException("Duplicate menu item");
    const availableStations = await this.availableStations(
      table.organizationId,
    );
    const stations = [
      ...(availableStations.has(RestaurantStaffRole.KITCHEN)
        ? [RestaurantStation.KITCHEN]
        : []),
      ...(availableStations.has(RestaurantStaffRole.BAR)
        ? [RestaurantStation.BAR]
        : []),
    ];
    const menu = await this.prisma.restaurantMenuItem.findMany({
      where: {
        id: { in: ids },
        organizationId: table.organizationId,
        active: true,
        station: { in: stations },
      },
    });
    if (menu.length !== ids.length)
      throw new BadRequestException("Menu item unavailable");
    const byId = new Map(menu.map((item) => [item.id, item]));
    try {
      return await this.prisma.$transaction(async (tx) => {
        let visit = dto.accountAccessCode
          ? await tx.restaurantVisit.findFirst({
              where: {
                accessCode: dto.accountAccessCode,
                tableId: table.id,
                status: RestaurantVisitStatus.OPEN,
              },
            })
          : null;
        if (dto.accountAccessCode && !visit) {
          throw new BadRequestException(
            "The selected account is closed or does not belong to this table",
          );
        }
        if (!visit) {
          const settings = await tx.organization.findUniqueOrThrow({
            where: { id: table.organizationId },
            select: {
              restaurantTaxRateBps: true,
              restaurantTaxIncluded: true,
              restaurantServiceRateBps: true,
            },
          });
          visit = await tx.restaurantVisit.create({
            data: {
              organizationId: table.organizationId,
              tableId: table.id,
              taxRateBps: settings.restaurantTaxRateBps,
              taxIncluded: settings.restaurantTaxIncluded,
              serviceRateBps: settings.restaurantServiceRateBps,
              serviceChargeEnabled: table.serviceChargeEnabled,
            },
          });
        }
        const defaultFulfillment =
          table.kind === RestaurantTableKind.TAKEOUT_STATION
            ? RestaurantFulfillment.TAKEOUT
            : (dto.fulfillment ?? RestaurantFulfillment.DINE_IN);
        const promotion = dto.promotionId
          ? await tx.restaurantPromotion.findFirst({
              where: {
                id: dto.promotionId,
                organizationId: table.organizationId,
                active: true,
                startsAt: { lte: new Date() },
                endsAt: { gt: new Date() },
              },
            })
          : null;
        if (dto.promotionId && !promotion) {
          throw new BadRequestException("Promotion is unavailable or expired");
        }
        const selectedItems = dto.items.map(
          ({ menuItemId, quantity, fulfillment }) => {
            const item = byId.get(menuItemId)!;
            return {
              item,
              menuItemId,
              quantity,
              fulfillment:
                table.kind === RestaurantTableKind.TAKEOUT_STATION
                  ? RestaurantFulfillment.TAKEOUT
                  : (fulfillment ?? defaultFulfillment),
            };
          },
        );
        const eligibleSubtotal = promotion
          ? selectedItems
              .filter(
                ({ item }) =>
                  (!promotion.menuItemId || promotion.menuItemId === item.id) &&
                  (!promotion.productType ||
                    promotion.productType === item.productType),
              )
              .reduce(
                (sum, { item, quantity }) => sum + item.price * quantity,
                0,
              )
          : 0;
        const promotionCredit = promotion
          ? Math.min(promotion.creditAmount, eligibleSubtotal)
          : 0;
        const baseMinutes = Math.max(
          5,
          ...selectedItems.map(({ item }) => item.prepMinutes ?? 5),
        );
        const activeWork = await tx.restaurantOrderItem.count({
          where: {
            order: { organizationId: table.organizationId },
            status: {
              in: [
                RestaurantItemStatus.RECEIVED,
                RestaurantItemStatus.ACCEPTED,
                RestaurantItemStatus.PREPARING,
                RestaurantItemStatus.READY,
              ],
            },
          },
        });
        const expectedMinutes = Math.max(
          5,
          Math.round(baseMinutes * (1 + Math.min(activeWork, 30) / 30)),
        );
        const thresholdMinutes = Math.max(
          expectedMinutes + 5,
          Math.round(expectedMinutes * 1.35),
        );
        const created = await tx.restaurantOrder.create({
          data: {
            organizationId: table.organizationId,
            tableId: table.id,
            visitId: visit.id,
            requestId: dto.requestId,
            fulfillment: defaultFulfillment,
            promotionId: promotion?.id,
            promotionTitle: promotion?.title,
            promotionCredit,
            expectedMinutes,
            thresholdMinutes,
            items: {
              create: selectedItems.map(
                ({ item, menuItemId, quantity, fulfillment }) => {
                  return {
                    menuItemId,
                    quantity,
                    name: item.name,
                    price: item.price,
                    station: item.station,
                    course: item.course,
                    fulfillment,
                    prepMinutes: item.prepMinutes,
                    events: {
                      create: { status: RestaurantItemStatus.RECEIVED },
                    },
                  };
                },
              ),
            },
          },
          include,
        });
        return { ...created, accessCode: visit.accessCode };
      });
    } catch (error) {
      const existing = await this.prisma.restaurantOrder.findUnique({
        where: { requestId: dto.requestId },
        include,
      });
      if (existing?.tableId === table.id)
        return {
          ...existing,
          accessCode: existing.visit?.accessCode ?? existing.accessCode,
        };
      throw error;
    }
  }

  private billingTotals(
    items: Array<{ price: number; quantity: number; status: string }>,
    settings: {
      taxRateBps: number;
      taxIncluded: boolean;
      serviceRateBps: number;
    },
    serviceChargeEnabled: boolean,
    promotionCredit = 0,
  ) {
    const grossSubtotal = items
      .filter((item) => item.status !== RestaurantItemStatus.CANCELLED)
      .reduce((sum, item) => sum + item.price * item.quantity, 0);
    const credit = Math.min(Math.max(0, promotionCredit), grossSubtotal);
    const subtotal = grossSubtotal - credit;
    const tax = settings.taxIncluded
      ? Math.round(
          subtotal - (subtotal * 10000) / (10000 + settings.taxRateBps),
        )
      : Math.round((subtotal * settings.taxRateBps) / 10000);
    const service = serviceChargeEnabled
      ? Math.round((subtotal * settings.serviceRateBps) / 10000)
      : 0;
    return {
      grossSubtotal,
      promotionCredit: credit,
      subtotal,
      tax,
      service,
      total: subtotal + service + (settings.taxIncluded ? 0 : tax),
      taxIncluded: settings.taxIncluded,
      taxRateBps: settings.taxRateBps,
      serviceRateBps: settings.serviceRateBps,
      serviceChargeEnabled,
    };
  }

  async guestOrder(accessCode: string) {
    const visit = await this.prisma.restaurantVisit.findUnique({
      where: { accessCode },
      include: {
        table: {
          select: {
            name: true,
            code: true,
            kind: true,
            serviceChargeEnabled: true,
            waiter: { select: { id: true, name: true } },
          },
        },
        orders: {
          orderBy: { createdAt: "asc" },
          include: { items: true },
        },
      },
    });
    if (!visit) throw new NotFoundException("Order not found");
    const now = new Date();
    const [promotionRows, menu, availableStations] = await Promise.all([
      this.prisma.restaurantPromotion.findMany({
        where: {
          organizationId: visit.organizationId,
          active: true,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.restaurantMenuItem.findMany({
        where: { organizationId: visit.organizationId, active: true },
      }),
      this.availableStations(visit.organizationId),
    ]);
    const promotions = promotionRows
      .map((promotion) => ({
        ...promotion,
        menuItem:
          menu.find(
            (item) =>
              (promotion.menuItemId
                ? item.id === promotion.menuItemId
                : item.productType === promotion.productType) &&
              (item.station === RestaurantStation.KITCHEN
                ? availableStations.has(RestaurantStaffRole.KITCHEN)
                : availableStations.has(RestaurantStaffRole.BAR)),
          ) ?? null,
      }))
      .filter((promotion) => promotion.menuItem !== null);
    const items = visit.orders.flatMap((order) =>
      order.items.map((item) => ({ ...item, orderCreatedAt: order.createdAt })),
    );
    return {
      id: visit.id,
      accessCode: visit.accessCode,
      status: visit.status,
      createdAt: visit.openedAt,
      table: visit.table,
      orders: visit.orders,
      items,
      invoiceRequestStatus: visit.invoiceRequestStatus,
      promotions,
      billing: this.billingTotals(
        items,
        visit,
        visit.serviceChargeEnabled,
        visit.orders.reduce(
          (sum, order) => sum + (order.promotionCredit ?? 0),
          0,
        ),
      ),
    };
  }

  async orders(actor: RestaurantActor) {
    const role = this.effectiveRole(actor);
    if (!role) throw new ForbiddenException("Restaurant role required");
    const station =
      role === RestaurantStaffRole.KITCHEN
        ? RestaurantStation.KITCHEN
        : role === RestaurantStaffRole.BAR
          ? RestaurantStation.BAR
          : null;
    const openStatuses: RestaurantItemStatus[] = [
      RestaurantItemStatus.RECEIVED,
      RestaurantItemStatus.ACCEPTED,
      RestaurantItemStatus.PREPARING,
      RestaurantItemStatus.READY,
    ];
    const orders = await this.prisma.restaurantOrder.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(role === RestaurantStaffRole.WAITER
          ? { table: { waiterId: actor.id } }
          : {}),
        items: {
          some: {
            status: { in: openStatuses },
            ...(station ? { station } : {}),
          },
        },
      },
      include: {
        items: {
          where: {
            status: { in: openStatuses },
            ...(station ? { station } : {}),
          },
        },
        table: { select: { id: true, name: true, waiterId: true } },
        visit: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const evaluated = orders.map((order) => ({
      ...order,
      isDelayed:
        order.thresholdMinutes !== null &&
        Date.now() - order.createdAt.getTime() >
          order.thresholdMinutes * 60_000 &&
        order.items.some(
          (item) =>
            item.status === RestaurantItemStatus.RECEIVED ||
            item.status === RestaurantItemStatus.ACCEPTED ||
            item.status === RestaurantItemStatus.PREPARING ||
            item.status === RestaurantItemStatus.READY,
        ),
    }));
    const newlyDelayed = evaluated
      .filter((order) => order.isDelayed && order.delayedAt === null)
      .map((order) => order.id);
    if (newlyDelayed.length) {
      const delayedAt = new Date();
      await this.prisma.restaurantOrder.updateMany({
        where: { id: { in: newlyDelayed }, delayedAt: null },
        data: { delayedAt },
      });
      return evaluated.map((order) =>
        newlyDelayed.includes(order.id) ? { ...order, delayedAt } : order,
      );
    }
    return evaluated;
  }

  async visits(actor: RestaurantActor) {
    const role = this.effectiveRole(actor);
    if (
      role !== RestaurantStaffRole.RESTAURANT_ADMIN &&
      role !== RestaurantStaffRole.WAITER
    ) {
      throw new ForbiddenException("Waiter access required");
    }
    const visits = await this.prisma.restaurantVisit.findMany({
      where: {
        organizationId: actor.organizationId,
        status: RestaurantVisitStatus.OPEN,
        ...(role === RestaurantStaffRole.WAITER
          ? { table: { waiterId: actor.id } }
          : {}),
      },
      include: {
        table: {
          select: {
            id: true,
            name: true,
            waiterId: true,
            serviceChargeEnabled: true,
          },
        },
        orders: { include: { items: true } },
      },
      orderBy: { openedAt: "desc" },
    });
    return visits.map((visit) => {
      const items = visit.orders.flatMap((order) =>
        order.items.map((item) => ({
          ...item,
          orderId: order.id,
          orderCreatedAt: order.createdAt,
        })),
      );
      return {
        id: visit.id,
        openedAt: visit.openedAt,
        table: visit.table,
        items,
        billing: this.billingTotals(
          items,
          visit,
          visit.serviceChargeEnabled,
          visit.orders.reduce(
            (sum, order) => sum + (order.promotionCredit ?? 0),
            0,
          ),
        ),
        canClose: items.every(
          (item) =>
            item.status === RestaurantItemStatus.DELIVERED ||
            item.status === RestaurantItemStatus.CANCELLED,
        ),
      };
    });
  }

  async updateStatus(
    actor: RestaurantActor,
    id: string,
    dto: UpdateItemStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.restaurantOrderItem.findFirst({
        where: { id, order: { organizationId: actor.organizationId } },
        include: {
          order: { select: { table: { select: { waiterId: true } } } },
        },
      });
      if (!item) throw new NotFoundException("Order item not found");
      const role = this.effectiveRole(actor);
      const isAdmin = role === RestaurantStaffRole.RESTAURANT_ADMIN;
      if (
        !isAdmin &&
        actor.restaurantAvailability !== RestaurantStaffAvailability.AVAILABLE
      ) {
        throw new ForbiddenException("Staff member is not available for work");
      }
      const isStation =
        (role === RestaurantStaffRole.KITCHEN &&
          item.station === RestaurantStation.KITCHEN) ||
        (role === RestaurantStaffRole.BAR &&
          item.station === RestaurantStation.BAR);
      const isAssignedWaiter =
        role === RestaurantStaffRole.WAITER &&
        item.order.table.waiterId === actor.id;
      const stationTarget: boolean = (
        [
          RestaurantItemStatus.ACCEPTED,
          RestaurantItemStatus.PREPARING,
          RestaurantItemStatus.READY,
        ] as RestaurantItemStatus[]
      ).includes(dto.status);
      const waiterTarget = dto.status === RestaurantItemStatus.DELIVERED;
      if (
        !isAdmin &&
        !((isStation && stationTarget) || (isAssignedWaiter && waiterTarget))
      ) {
        throw new ForbiddenException(
          "Status change is not allowed for this role",
        );
      }
      if (!transitions[item.status].includes(dto.status))
        throw new BadRequestException("Invalid status change");
      const now = new Date();
      const result = await tx.restaurantOrderItem.updateMany({
        where: { id, status: item.status },
        data: {
          status: dto.status,
          ...(dto.status === "ACCEPTED" ? { acceptedAt: now } : {}),
          ...(dto.status === "READY" ? { readyAt: now } : {}),
          ...(dto.status === "DELIVERED" ? { deliveredAt: now } : {}),
        },
      });
      if (!result.count)
        throw new ConflictException("Item was updated by someone else");
      await tx.restaurantItemEvent.create({
        data: { itemId: id, actorId: actor.id, status: dto.status },
      });
      return tx.restaurantOrderItem.findUnique({ where: { id } });
    });
  }

  async updateItemFulfillment(
    actor: RestaurantActor,
    id: string,
    dto: UpdateItemFulfillmentDto,
  ) {
    const reason = dto.reason?.trim() || null;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.restaurantOrderItem.findFirst({
        where: { id, order: { organizationId: actor.organizationId } },
        include: {
          order: { select: { table: { select: { waiterId: true } } } },
        },
      });
      if (!item) throw new NotFoundException("Order item not found");
      const role = this.effectiveRole(actor);
      const allowed =
        role === RestaurantStaffRole.RESTAURANT_ADMIN ||
        (role === RestaurantStaffRole.WAITER &&
          item.order.table.waiterId === actor.id);
      if (!allowed) {
        throw new ForbiddenException(
          "Only the assigned waiter or administrator can correct delivery mode",
        );
      }
      const updated = await tx.restaurantOrderItem.update({
        where: { id },
        data: { fulfillment: dto.fulfillment },
      });
      await tx.restaurantItemEvent.create({
        data: {
          itemId: id,
          actorId: actor.id,
          status: item.status,
          note: `Fulfillment corrected from ${item.fulfillment} to ${dto.fulfillment}${reason ? `: ${reason}` : ""}`,
        },
      });
      return updated;
    });
  }
}
