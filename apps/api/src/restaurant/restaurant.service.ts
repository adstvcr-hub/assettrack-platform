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
  RestaurantItemStatus,
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  RestaurantStation,
  RestaurantVisitStatus,
  UserRole,
} from "../generated/prisma/enums";
import {
  CreateMenuItemDto,
  CreateTableDto,
  PlaceOrderDto,
  UpdateItemStatusDto,
  UpdateMenuItemDto,
  UpdateRestaurantBillingDto,
  UpdateStaffAvailabilityDto,
  UpdateTableBillingDto,
} from "./dto/restaurant.dto";

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
    return this.prisma.restaurantTable.create({
      data: { organizationId, name },
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
      return tx.user.update({
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
      return updated;
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

      const reassignments: Array<{
        tableId: string;
        tableName: string;
        waiterId: string;
        waiterName: string;
      }> = [];
      const unassignedTables: Array<{ id: string; name: string }> = [];

      if (
        user.restaurantRole === RestaurantStaffRole.WAITER &&
        dto.availability !== RestaurantStaffAvailability.AVAILABLE
      ) {
        const [tables, waiters] = await Promise.all([
          tx.restaurantTable.findMany({
            where: {
              organizationId: actor.organizationId,
              waiterId: actor.id,
              active: true,
            },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          tx.user.findMany({
            where: {
              organizationId: actor.organizationId,
              id: { not: actor.id },
              restaurantRole: RestaurantStaffRole.WAITER,
              restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
            },
            select: {
              id: true,
              name: true,
              restaurantTables: {
                where: { active: true },
                select: { id: true },
              },
            },
            orderBy: [{ name: "asc" }, { id: "asc" }],
          }),
        ]);

        const workloads = waiters.map((waiter) => ({
          id: waiter.id,
          name: waiter.name,
          activeTables: waiter.restaurantTables.length,
        }));
        for (const table of tables) {
          workloads.sort(
            (left, right) =>
              left.activeTables - right.activeTables ||
              left.name.localeCompare(right.name) ||
              left.id.localeCompare(right.id),
          );
          const replacement = workloads[0];
          if (!replacement) {
            await tx.restaurantTable.update({
              where: { id: table.id },
              data: { waiterId: null },
            });
            unassignedTables.push(table);
            continue;
          }
          await tx.restaurantTable.update({
            where: { id: table.id },
            data: { waiterId: replacement.id },
          });
          replacement.activeTables += 1;
          reassignments.push({
            tableId: table.id,
            tableName: table.name,
            waiterId: replacement.id,
            waiterName: replacement.name,
          });
        }
      }

      return { staff: updated, reassignments, unassignedTables };
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
    const base = (
      process.env.PUBLIC_WEB_URL ?? "http://localhost:3001"
    ).replace(/\/$/, "");
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

  addMenuItem(actor: RestaurantActor, dto: CreateMenuItemDto) {
    this.requireRestaurantAdmin(actor);
    if (!dto.name.trim()) throw new BadRequestException("Item name required");
    return this.prisma.restaurantMenuItem.create({
      data: {
        ...dto,
        name: dto.name.trim(),
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
    const result = await this.prisma.restaurantMenuItem.updateMany({
      where: { id, organizationId: actor.organizationId },
      data: dto,
    });
    if (!result.count) throw new NotFoundException("Menu item not found");
    return this.prisma.restaurantMenuItem.findUnique({ where: { id } });
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
    const menu = await this.prisma.restaurantMenuItem.findMany({
      where: {
        organizationId: table.organizationId,
        active: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return {
      restaurant: table.organization.name,
      table: table.name,
      waiter: table.waiter,
      billing: {
        taxRateBps: table.organization.restaurantTaxRateBps,
        taxIncluded: table.organization.restaurantTaxIncluded,
        serviceRateBps: table.organization.restaurantServiceRateBps,
        serviceChargeEnabled: table.serviceChargeEnabled,
      },
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
    const open = await this.prisma.restaurantOrder.count({
      where: {
        tableId: table.id,
        items: {
          some: {
            status: { in: ["RECEIVED", "ACCEPTED", "PREPARING", "READY"] },
          },
        },
      },
    });
    if (open >= 3)
      throw new ConflictException(
        "Please contact the staff before placing another order",
      );
    try {
      return await this.prisma.$transaction(async (tx) => {
        let visit = await tx.restaurantVisit.findFirst({
          where: { tableId: table.id, status: RestaurantVisitStatus.OPEN },
        });
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
        const created = await tx.restaurantOrder.create({
          data: {
            organizationId: table.organizationId,
            tableId: table.id,
            visitId: visit.id,
            requestId: dto.requestId,
            items: {
              create: dto.items.map(({ menuItemId, quantity }) => {
                const item = byId.get(menuItemId)!;
                return {
                  menuItemId,
                  quantity,
                  name: item.name,
                  price: item.price,
                  station: item.station,
                  course: item.course,
                  events: { create: { status: RestaurantItemStatus.RECEIVED } },
                };
              }),
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
  ) {
    const subtotal = items
      .filter((item) => item.status !== RestaurantItemStatus.CANCELLED)
      .reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = settings.taxIncluded
      ? Math.round(
          subtotal - (subtotal * 10000) / (10000 + settings.taxRateBps),
        )
      : Math.round((subtotal * settings.taxRateBps) / 10000);
    const service = serviceChargeEnabled
      ? Math.round((subtotal * settings.serviceRateBps) / 10000)
      : 0;
    return {
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
      billing: this.billingTotals(items, visit, visit.serviceChargeEnabled),
    };
  }

  orders(actor: RestaurantActor) {
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
    return this.prisma.restaurantOrder.findMany({
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
        billing: this.billingTotals(items, visit, visit.serviceChargeEnabled),
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
}
