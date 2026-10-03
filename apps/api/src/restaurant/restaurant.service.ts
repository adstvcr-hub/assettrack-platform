import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as QRCode from "qrcode";
import {
  RestaurantFulfillment,
  RestaurantInvoiceRequestStatus,
  RestaurantItemStatus,
  RestaurantInventoryMovementType,
  RestaurantInventoryProductType,
  RestaurantLoyaltyActivityType,
  RestaurantPaymentStatus,
  RestaurantPayPeriod,
  RestaurantRewardSponsor,
  RestaurantRewardType,
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  RestaurantStation,
  RestaurantTableKind,
  RestaurantVisitStatus,
  UserRole,
} from "../generated/prisma/enums";
import {
  CreateMenuItemDto,
  CreateInventoryCategoryDto,
  CreateInventoryMovementDto,
  CreateInventoryProductDto,
  CreateLiquorWeighingDto,
  CorrectGuestOrderDto,
  CorrectStaffOrderDto,
  CreatePromotionDto,
  CreateRewardProgramDto,
  CreateStaffOrderDto,
  CreateTableDto,
  PlaceOrderDto,
  RecordQrAccessDto,
  JoinLoyaltyDto,
  RequestInvoiceDto,
  RequestGuestOrderCorrectionDto,
  UpdateItemStatusDto,
  UpdateItemFulfillmentDto,
  UpdateInvoiceRequestDto,
  UpdateMenuItemDto,
  UpdateInventoryProductDto,
  UpdateRestaurantBillingDto,
  UpdateRestaurantBrandingDto,
  UpdateRestaurantOrderingAreaDto,
  UpdateStaffAvailabilityDto,
  UpdateStaffPayrollDto,
  UpdateTableBillingDto,
  UpdatePromotionDto,
} from "./dto/restaurant.dto";
import type { Prisma } from "../generated/prisma/client";
import {
  getUtcDateRangeForLocalDate,
  normalizeTimezone,
} from "../common/timezone-date-range";
import { RestaurantDataLifecycleService } from "./restaurant-data-lifecycle.service";

const transitions: Record<RestaurantItemStatus, RestaurantItemStatus[]> = {
  RECEIVED: [RestaurantItemStatus.ACCEPTED, RestaurantItemStatus.CANCELLED, RestaurantItemStatus.DELIVERED],
  ACCEPTED: [RestaurantItemStatus.PREPARING, RestaurantItemStatus.CANCELLED, RestaurantItemStatus.DELIVERED],
  PREPARING: [RestaurantItemStatus.READY, RestaurantItemStatus.CANCELLED, RestaurantItemStatus.DELIVERED],
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
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly lifecycle?: RestaurantDataLifecycleService,
  ) {}

  private receiptNumber(visitId: string, closedAt: Date) {
    return (
      this.lifecycle?.receiptNumber(visitId, closedAt) ??
      `AT-${closedAt.toISOString().slice(0, 10).replaceAll("-", "")}-${visitId.replaceAll("-", "").slice(0, 16).toUpperCase()}`
    );
  }

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

  private requireInventoryAccess(actor: RestaurantActor, write = false) {
    const role = this.effectiveRole(actor);
    if (
      role !== RestaurantStaffRole.RESTAURANT_ADMIN &&
      role !== RestaurantStaffRole.BAR
    ) {
      throw new ForbiddenException("Inventory access requires administration or bar role");
    }
    if (
      write &&
      role === RestaurantStaffRole.BAR &&
      actor.restaurantAvailability !== RestaurantStaffAvailability.AVAILABLE
    ) {
      throw new ForbiddenException("El bartender no está disponible para registrar inventario");
    }
    return role;
  }

  private distanceMeters(
    latitudeA: number,
    longitudeA: number,
    latitudeB: number,
    longitudeB: number,
  ) {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const earthRadius = 6_371_000;
    const latitudeDelta = radians(latitudeB - latitudeA);
    const longitudeDelta = radians(longitudeB - longitudeA);
    const value =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(latitudeA)) *
        Math.cos(radians(latitudeB)) *
        Math.sin(longitudeDelta / 2) ** 2;
    return Math.round(
      2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)),
    );
  }

  private async assertOperationalStaffInsideRestaurant(
    actor: RestaurantActor,
    dto: UpdateStaffAvailabilityDto,
  ) {
    if (
      dto.availability !== RestaurantStaffAvailability.AVAILABLE ||
      (actor.restaurantRole !== RestaurantStaffRole.KITCHEN &&
        actor.restaurantRole !== RestaurantStaffRole.BAR &&
        actor.restaurantRole !== RestaurantStaffRole.WAITER)
    ) {
      return;
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: actor.organizationId },
      select: {
        restaurantLatitude: true,
        restaurantLongitude: true,
        restaurantOrderRadiusMeters: true,
      },
    });
    if (
      !organization ||
      organization.restaurantLatitude == null ||
      organization.restaurantLongitude == null
    ) {
      return;
    }
    if (dto.latitude === undefined || dto.longitude === undefined) {
      throw new ForbiddenException(
        "Debe confirmar su ubicación para activar su puesto de trabajo",
      );
    }
    const distance = this.distanceMeters(
      Number(organization.restaurantLatitude),
      Number(organization.restaurantLongitude),
      dto.latitude,
      dto.longitude,
    );
    const tolerance = Math.min(Math.round(dto.locationAccuracy ?? 0), 50);
    if (distance > organization.restaurantOrderRadiusMeters + tolerance) {
      throw new ForbiddenException(
        "Estás fuera del alcance del local comercial",
      );
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
          active: true,
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

  private async selectAccountCoverageStaff(
    tx: Prisma.TransactionClient,
    organizationId: string,
    tableKind: RestaurantTableKind,
    excludeId?: string,
  ) {
    const roleGroups: RestaurantStaffRole[][] =
      tableKind === RestaurantTableKind.DINING
        ? [
            [RestaurantStaffRole.WAITER],
            [RestaurantStaffRole.BAR],
            [RestaurantStaffRole.RESTAURANT_ADMIN],
          ]
        : tableKind === RestaurantTableKind.BAR_SEAT
          ? [
              [RestaurantStaffRole.BAR],
              [RestaurantStaffRole.RESTAURANT_ADMIN],
            ]
          : [
              [RestaurantStaffRole.BAR, RestaurantStaffRole.WAITER],
              [RestaurantStaffRole.RESTAURANT_ADMIN],
            ];

    for (const roles of roleGroups) {
      const administratorGroup = roles.includes(
        RestaurantStaffRole.RESTAURANT_ADMIN,
      );
      const candidates = await tx.user.findMany({
        where: {
          organizationId,
          active: true,
          restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
          ...(administratorGroup
            ? {
                OR: [
                  { restaurantRole: RestaurantStaffRole.RESTAURANT_ADMIN },
                  { role: { in: [UserRole.OWNER, UserRole.ADMIN] } },
                ],
              }
            : { restaurantRole: { in: roles } }),
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true, restaurantRole: true, role: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      });
      const eligible = candidates.filter(
        (candidate) =>
          Boolean(candidate.id) &&
          (administratorGroup ||
            (candidate.restaurantRole !== null &&
              roles.includes(candidate.restaurantRole))),
      );
      if (!eligible.length) continue;
      const loads = await Promise.all(
        eligible.map(async (candidate) => ({
          ...candidate,
          coverageRole:
            candidate.restaurantRole ?? RestaurantStaffRole.RESTAURANT_ADMIN,
          load: await tx.restaurantVisit.count({
            where: {
              organizationId,
              responsibleStaffId: candidate.id,
              status: RestaurantVisitStatus.OPEN,
            },
          }),
        })),
      );
      loads.sort((left, right) => left.load - right.load);
      return loads[0] ?? null;
    }
    return null;
  }

  private async recoverOpenAccountAssignments(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const visits =
      (await tx.restaurantVisit.findMany({
      where: { organizationId, status: RestaurantVisitStatus.OPEN },
      include: {
        table: { select: { kind: true } },
        responsibleStaff: {
          select: {
            id: true,
            active: true,
            restaurantRole: true,
            restaurantAvailability: true,
          },
        },
      },
    })) ?? [];
    const accountReassignments: Array<{
      visitId: string;
      responsibleStaffId: string;
      coverageRole: RestaurantStaffRole;
    }> = [];
    const unassignedAccounts: string[] = [];

    for (const visit of visits) {
      const current = visit.responsibleStaff;
      const currentAvailable =
        current?.active === true &&
        current.restaurantAvailability ===
          RestaurantStaffAvailability.AVAILABLE;
      const currentIsPreferred =
        currentAvailable &&
        ((visit.table.kind === RestaurantTableKind.DINING &&
          current.restaurantRole === RestaurantStaffRole.WAITER) ||
          (visit.table.kind === RestaurantTableKind.BAR_SEAT &&
            current.restaurantRole === RestaurantStaffRole.BAR) ||
          (visit.table.kind === RestaurantTableKind.TAKEOUT_STATION &&
            (current.restaurantRole === RestaurantStaffRole.BAR ||
              current.restaurantRole === RestaurantStaffRole.WAITER)));
      if (currentIsPreferred) continue;

      const candidate = await this.selectAccountCoverageStaff(
        tx,
        organizationId,
        visit.table.kind,
      );
      if (!candidate) {
        if (!currentAvailable) unassignedAccounts.push(visit.id);
        continue;
      }
      if (candidate.id === visit.responsibleStaffId) continue;
      await tx.restaurantVisit.update({
        where: { id: visit.id },
        data: {
          responsibleStaffId: candidate.id,
          ...(current?.restaurantRole === RestaurantStaffRole.WAITER
            ? { fallbackStaffId: current.id }
            : {}),
        },
      });
      accountReassignments.push({
        visitId: visit.id,
        responsibleStaffId: candidate.id,
        coverageRole: candidate.coverageRole,
      });
    }
    return { accountReassignments, unassignedAccounts };
  }

  async profile(actor: RestaurantActor) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: actor.id,
        organizationId: actor.organizationId,
        active: true,
      },
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
          active: true,
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
        restaurantOrderCorrectionMinutes: true,
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
        restaurantOrderCorrectionMinutes: dto.orderCorrectionMinutes,
      },
      select: {
        restaurantTaxRateBps: true,
        restaurantTaxIncluded: true,
        restaurantServiceRateBps: true,
        restaurantOrderCorrectionMinutes: true,
      },
    });
  }

  orderingAreaSettings(actor: RestaurantActor) {
    this.requireRestaurantAdmin(actor);
    return this.prisma.organization.findUnique({
      where: { id: actor.organizationId },
      select: {
        restaurantLatitude: true,
        restaurantLongitude: true,
        restaurantOrderRadiusMeters: true,
      },
    });
  }

  updateOrderingAreaSettings(
    actor: RestaurantActor,
    dto: UpdateRestaurantOrderingAreaDto,
  ) {
    this.requireRestaurantAdmin(actor);
    return this.prisma.organization.update({
      where: { id: actor.organizationId },
      data: {
        restaurantLatitude: dto.latitude,
        restaurantLongitude: dto.longitude,
        restaurantOrderRadiusMeters: dto.radiusMeters,
      },
      select: {
        restaurantLatitude: true,
        restaurantLongitude: true,
        restaurantOrderRadiusMeters: true,
      },
    });
  }

  async analytics(actor: RestaurantActor, from?: string, to?: string) {
    this.requireRestaurantAdmin(actor);
    await this.lifecycle?.consolidatePending(actor.organizationId);
    const location = await this.prisma.organizationLocation.findFirst({
      where: { organizationId: actor.organizationId, active: true },
      select: { timezone: true },
      orderBy: { createdAt: "asc" },
    });
    const timezone = normalizeTimezone(location?.timezone ?? "UTC");
    const localDate = (date: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    const today = localDate(new Date());
    const defaultStart = new Date(`${today}T00:00:00.000Z`);
    defaultStart.setUTCDate(defaultStart.getUTCDate() - 29);
    const fromDate = from ?? defaultStart.toISOString().slice(0, 10);
    const toDate = to ?? today;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toDate)
    ) {
      throw new BadRequestException("Use dates in YYYY-MM-DD format");
    }
    const start = getUtcDateRangeForLocalDate(fromDate, timezone).start;
    const end = getUtcDateRangeForLocalDate(toDate, timezone).end;
    if (start >= end || end.getTime() - start.getTime() > 366 * 86400000) {
      throw new BadRequestException("Invalid analytics date range");
    }
    const [aggregates, popularItems, openVisits] = await Promise.all([
      this.prisma.restaurantAnalyticsDaily.findMany({
        where: {
          organizationId: actor.organizationId,
          date: { gte: fromDate, lte: toDate },
        },
        orderBy: { date: "asc" },
      }),
      this.prisma.restaurantAnalyticsProductDaily.groupBy({
        by: ["productName"],
        where: {
          organizationId: actor.organizationId,
          date: { gte: fromDate, lte: toDate },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 10,
      }),
      this.prisma.restaurantVisit.count({
        where: {
          organizationId: actor.organizationId,
          status: RestaurantVisitStatus.OPEN,
        },
      }),
    ]);
    const totals = {
      grossSubtotal: 0,
      promotionCredit: 0,
      subtotal: 0,
      tax: 0,
      service: 0,
      total: 0,
      itemsSold: 0,
      itemsCancelled: 0,
    };
    for (const aggregate of aggregates) {
      totals.grossSubtotal += aggregate.grossSubtotal;
      totals.promotionCredit += aggregate.promotionCredit;
      totals.subtotal += aggregate.subtotal;
      totals.tax += aggregate.tax;
      totals.service += aggregate.service;
      totals.total += aggregate.total;
      totals.itemsSold += aggregate.itemsSold;
      totals.itemsCancelled += aggregate.itemsCancelled;
    }
    return {
      range: { from: fromDate, to: toDate, timezone },
      qrAccesses: aggregates.reduce((sum, entry) => sum + entry.qrAccesses, 0),
      uniqueQrSessions: aggregates.reduce(
        (sum, entry) => sum + entry.uniqueQrSessions,
        0,
      ),
      visitsOpened: aggregates.reduce(
        (sum, entry) => sum + entry.visitsOpened,
        0,
      ),
      visitsClosed: aggregates.reduce(
        (sum, entry) => sum + entry.visitsClosed,
        0,
      ),
      openVisits,
      orders: aggregates.reduce((sum, entry) => sum + entry.orders, 0),
      ...totals,
      daily: aggregates.map((entry) => ({
        date: entry.date,
        qrAccesses: entry.qrAccesses,
        orders: entry.orders,
        sales: entry.subtotal,
      })),
      popularItems: popularItems.map((entry) => ({
        name: entry.productName,
        quantity: entry._sum.quantity ?? 0,
      })),
    };
  }

  async salesHistory(
    actor: RestaurantActor,
    search = "",
    from?: string,
    to?: string,
    page = 1,
    limit = 25,
    maximumLimit = 100,
  ) {
    this.requireRestaurantAdmin(actor);
    await this.lifecycle?.consolidatePending(actor.organizationId);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { restaurantRetentionDays: true },
    });
    const location = await this.prisma.organizationLocation.findFirst({
      where: { organizationId: actor.organizationId, active: true },
      select: { timezone: true },
      orderBy: { createdAt: "asc" },
    });
    const timezone = normalizeTimezone(location?.timezone ?? "UTC");
    const cutoff = new Date(
      Date.now() - organization.restaurantRetentionDays * 86_400_000,
    );
    let start = cutoff;
    let end = new Date();
    if (from) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        throw new BadRequestException("Use dates in YYYY-MM-DD format");
      }
      const requested = getUtcDateRangeForLocalDate(from, timezone).start;
      if (requested > start) start = requested;
    }
    if (to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        throw new BadRequestException("Use dates in YYYY-MM-DD format");
      }
      end = getUtcDateRangeForLocalDate(to, timezone).end;
    }
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(
      maximumLimit,
      Math.max(1, Math.floor(limit) || 25),
    );
    const term = search.trim().slice(0, 160);
    const where: Prisma.RestaurantVisitWhereInput = {
      organizationId: actor.organizationId,
      status: RestaurantVisitStatus.CLOSED,
      closedAt: { gte: start, lt: end },
      ...(term
        ? {
            OR: [
              { receiptNumber: { contains: term, mode: "insensitive" } },
              { table: { name: { contains: term, mode: "insensitive" } } },
              {
                responsibleStaff: {
                  name: { contains: term, mode: "insensitive" },
                },
              },
              { invoiceName: { contains: term, mode: "insensitive" } },
              { invoiceEmail: { contains: term, mode: "insensitive" } },
              { invoicePhone: { contains: term, mode: "insensitive" } },
              { invoiceTaxId: { contains: term, mode: "insensitive" } },
              { invoiceReference: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [visits, total, summaryVisits] = await Promise.all([
      this.prisma.restaurantVisit.findMany({
        where,
        include: {
          table: { select: { name: true, kind: true } },
          responsibleStaff: { select: { name: true } },
          orders: {
            orderBy: { createdAt: "asc" },
            include: {
              items: {
                orderBy: { name: "asc" },
                include: { events: { orderBy: { createdAt: "asc" } } },
              },
            },
          },
        },
        orderBy: { closedAt: "desc" },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.restaurantVisit.count({ where }),
      this.prisma.restaurantVisit.findMany({
        where,
        select: {
          table: { select: { name: true } },
          responsibleStaff: { select: { name: true } },
          taxRateBps: true,
          taxIncluded: true,
          serviceRateBps: true,
          serviceChargeEnabled: true,
          orders: {
            select: {
              promotionCredit: true,
              items: {
                select: {
                  price: true,
                  quantity: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
    ]);
    const correctionActorIds = [
      ...new Set(
        visits.flatMap((visit) =>
          visit.orders.flatMap((order) =>
            order.items.flatMap((item) =>
              (item.events ?? [])
                .filter((event) => event.note?.includes("corrección"))
                .map((event) => event.actorId)
                .filter((id): id is string => Boolean(id)),
            ),
          ),
        ),
      ),
    ];
    const correctionActors = correctionActorIds.length
      ? await this.prisma.user.findMany({
          where: {
            organizationId: actor.organizationId,
            id: { in: correctionActorIds },
          },
          select: { id: true, name: true },
        })
      : [];
    const correctionActorNames = new Map(
      correctionActors.map((entry) => [entry.id, entry.name]),
    );
    const summary = {
      accounts: total,
      orders: 0,
      items: 0,
      billing: {
        grossSubtotal: 0,
        promotionCredit: 0,
        subtotal: 0,
        tax: 0,
        service: 0,
        total: 0,
      },
      byResponsible: new Map<
        string,
        { name: string; accounts: number; orders: number; total: number }
      >(),
      byTable: new Map<
        string,
        { name: string; accounts: number; orders: number; total: number }
      >(),
    };
    for (const visit of summaryVisits) {
      const items = visit.orders.flatMap((order) => order.items);
      const billing = this.billingTotals(
        items,
        visit,
        visit.serviceChargeEnabled,
        visit.orders.reduce(
          (sum, order) => sum + (order.promotionCredit ?? 0),
          0,
        ),
      );
      summary.orders += visit.orders.length;
      summary.items += items
        .filter((item) => item.status !== RestaurantItemStatus.CANCELLED)
        .reduce((sum, item) => sum + item.quantity, 0);
      summary.billing.grossSubtotal += billing.grossSubtotal;
      summary.billing.promotionCredit += billing.promotionCredit;
      summary.billing.subtotal += billing.subtotal;
      summary.billing.tax += billing.tax;
      summary.billing.service += billing.service;
      summary.billing.total += billing.total;

      const responsibleName =
        visit.responsibleStaff?.name?.trim() || "Sin asignar";
      const responsible = summary.byResponsible.get(responsibleName) ?? {
        name: responsibleName,
        accounts: 0,
        orders: 0,
        total: 0,
      };
      responsible.accounts += 1;
      responsible.orders += visit.orders.length;
      responsible.total += billing.total;
      summary.byResponsible.set(responsibleName, responsible);

      const table = summary.byTable.get(visit.table.name) ?? {
        name: visit.table.name,
        accounts: 0,
        orders: 0,
        total: 0,
      };
      table.accounts += 1;
      table.orders += visit.orders.length;
      table.total += billing.total;
      summary.byTable.set(visit.table.name, table);
    }
    const sortSummary = (
      left: { name: string; total: number },
      right: { name: string; total: number },
    ) => right.total - left.total || left.name.localeCompare(right.name);
    return {
      items: visits.map((visit) => {
        const items = visit.orders.flatMap((order) =>
          order.items
            .filter((item) => item.status !== RestaurantItemStatus.CANCELLED)
            .map((item) => ({
            id: item.id,
            orderCreatedAt: order.createdAt,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            unitPrice: item.price,
            total: item.price * item.quantity,
            status: item.status,
            fulfillment: item.fulfillment,
          })),
        );
        const corrections = visit.orders
          .filter((order) => order.correctionCount > 0)
          .map((order) => {
            const replacedItems = order.items.filter(
              (item) => item.cancelledByGuestCorrection,
            );
            const effectiveItems = order.items.filter(
              (item) => item.status !== RestaurantItemStatus.CANCELLED,
            );
            const correctionEvents = replacedItems
              .flatMap((item) => item.events ?? [])
              .filter((event) => event.note?.includes("corrección"))
              .sort(
                (left, right) =>
                  left.createdAt.getTime() - right.createdAt.getTime(),
              );
            const latestEvent = correctionEvents.at(-1);
            return {
              orderId: order.id,
              orderCreatedAt: order.createdAt,
              correctionCount: order.correctionCount,
              correctedAt: latestEvent?.createdAt ?? null,
              source: latestEvent?.actorId ? "EMPLOYEE" : "CUSTOMER",
              correctedBy: latestEvent?.actorId
                ? {
                    id: latestEvent.actorId,
                    name:
                      correctionActorNames.get(latestEvent.actorId) ??
                      "Empleado",
                  }
                : null,
              reason:
                latestEvent?.note?.split(": ").slice(1).join(": ") || null,
              originalItems: replacedItems.map((item) => ({
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                unitPrice: item.price,
                total: item.price * item.quantity,
              })),
              finalItems: effectiveItems.map((item) => ({
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                unitPrice: item.price,
                total: item.price * item.quantity,
              })),
            };
          });
        return {
          id: visit.id,
          receiptNumber:
            visit.receiptNumber ??
            (visit.closedAt
              ? this.receiptNumber(visit.id, visit.closedAt)
              : visit.id),
          openedAt: visit.openedAt,
          closedAt: visit.closedAt,
          expiresAt: visit.closedAt
            ? new Date(
                visit.closedAt.getTime() +
                  organization.restaurantRetentionDays * 86_400_000,
              )
            : null,
          table: visit.table,
          responsibleStaff: visit.responsibleStaff,
          items,
          corrections,
          billing: this.billingTotals(
            items,
            visit,
            visit.serviceChargeEnabled,
            visit.orders.reduce(
              (sum, order) => sum + (order.promotionCredit ?? 0),
              0,
            ),
          ),
          invoice: {
            status: visit.invoiceRequestStatus,
            requestedAt: visit.invoiceRequestedAt,
            name: visit.invoiceName,
            email: visit.invoiceEmail,
            phone: visit.invoicePhone,
            taxId: visit.invoiceTaxId,
            reference: visit.invoiceReference,
          },
        };
      }),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      range: { from: start, to: end, timezone },
      summary: {
        accounts: summary.accounts,
        orders: summary.orders,
        items: summary.items,
        billing: summary.billing,
        byResponsible: [...summary.byResponsible.values()].sort(sortSummary),
        byTable: [...summary.byTable.values()].sort(sortSummary),
      },
      retentionDays: organization.restaurantRetentionDays,
      maximumRetentionDays: 30,
      cutoff,
    };
  }

  async salesHistoryCsv(
    actor: RestaurantActor,
    search = "",
    from?: string,
    to?: string,
  ) {
    const history = await this.salesHistory(
      actor,
      search,
      from,
      to,
      1,
      5_000,
      5_000,
    );
    const escape = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows: unknown[][] = [
      [
        "Comprobante",
        "Cierre",
        "Mesa/posición",
        "Responsable",
        "Producto",
        "Cantidad",
        "Precio unitario",
        "Total producto",
        "Subtotal",
        "IVA",
        "Servicio",
        "Total cuenta",
        "Estado factura electrónica",
        "Referencia fiscal",
        "Orden corregida",
        "Cantidad de correcciones",
        "Detalle reemplazado",
      ],
    ];
    for (const visit of history.items) {
      const correctionCount = visit.corrections.reduce(
        (sum, correction) => sum + correction.correctionCount,
        0,
      );
      const correctionDetail = visit.corrections
        .map(
          (correction) =>
            `${correction.originalItems
              .map((item) => `${item.quantity} x ${item.name}`)
              .join(" + ")} -> ${correction.finalItems
              .map((item) => `${item.quantity} x ${item.name}`)
              .join(" + ")}`,
        )
        .join(" | ");
      const items = visit.items.length ? visit.items : [null];
      for (const item of items) {
        rows.push([
          visit.receiptNumber,
          visit.closedAt?.toISOString() ?? "",
          visit.table.name,
          visit.responsibleStaff?.name ?? "",
          item?.name ?? "",
          item?.quantity ?? "",
          item?.unitPrice ?? "",
          item?.total ?? "",
          visit.billing.subtotal,
          visit.billing.tax,
          visit.billing.service,
          visit.billing.total,
          visit.invoice.status,
          visit.invoice.reference ?? "",
          correctionCount ? "Sí" : "No",
          correctionCount,
          correctionDetail,
        ]);
      }
    }
    return `\uFEFF${rows.map((row) => row.map(escape).join(",")).join("\r\n")}`;
  }

  brandingSettings(actor: RestaurantActor) {
    this.requireRestaurantAdmin(actor);
    return this.prisma.organization.findUnique({
      where: { id: actor.organizationId },
      select: {
        name: true,
        restaurantDisplayName: true,
        restaurantHeaderImageData: true,
        restaurantUseHeaderImage: true,
        restaurantMenuBackgroundImageData: true,
        restaurantMenuBackgroundEnabled: true,
        restaurantMenuBackgroundPosition: true,
        restaurantMenuBackgroundSize: true,
      },
    });
  }

  updateBrandingSettings(
    actor: RestaurantActor,
    dto: UpdateRestaurantBrandingDto,
  ) {
    this.requireRestaurantAdmin(actor);
    return this.prisma.organization.update({
      where: { id: actor.organizationId },
      data: {
        restaurantDisplayName: dto.displayName?.trim() || null,
        restaurantHeaderImageData: dto.headerImageData ?? null,
        restaurantUseHeaderImage:
          dto.useHeaderImage && Boolean(dto.headerImageData),
        restaurantMenuBackgroundImageData: dto.menuBackgroundImageData ?? null,
        restaurantMenuBackgroundEnabled:
          dto.menuBackgroundEnabled && Boolean(dto.menuBackgroundImageData),
        restaurantMenuBackgroundPosition: dto.menuBackgroundPosition,
        restaurantMenuBackgroundSize: dto.menuBackgroundSize,
      },
      select: {
        name: true,
        restaurantDisplayName: true,
        restaurantHeaderImageData: true,
        restaurantUseHeaderImage: true,
        restaurantMenuBackgroundImageData: true,
        restaurantMenuBackgroundEnabled: true,
        restaurantMenuBackgroundPosition: true,
        restaurantMenuBackgroundSize: true,
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
        restaurantPayPeriod: true,
        restaurantPayRate: true,
        restaurantStandardMinutesPerDay: true,
        restaurantWorkDaysPerMonth: true,
        restaurantCcssDeductionEnabled: true,
        restaurantCcssDeductionBps: true,
        active: true,
        staffAccessCode: {
          select: { active: true, updatedAt: true, lastUsedAt: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async staffHours(
    actor: RestaurantActor,
    from?: string,
    to?: string,
    userId?: string,
  ) {
    this.requireRestaurantAdmin(actor);
    const location = await this.prisma.organizationLocation.findFirst({
      where: { organizationId: actor.organizationId, active: true },
      select: { timezone: true },
      orderBy: { createdAt: "asc" },
    });
    const timezone = normalizeTimezone(location?.timezone ?? "UTC");
    const today = new Date().toISOString().slice(0, 10);
    const defaultStart = new Date();
    defaultStart.setUTCDate(defaultStart.getUTCDate() - 6);
    const fromDate = from ?? defaultStart.toISOString().slice(0, 10);
    const toDate = to ?? today;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toDate)
    ) {
      throw new BadRequestException("Use dates in YYYY-MM-DD format");
    }
    const start = getUtcDateRangeForLocalDate(fromDate, timezone).start;
    const end = getUtcDateRangeForLocalDate(toDate, timezone).end;
    if (start >= end) {
      throw new BadRequestException(
        "The start date cannot be after the end date",
      );
    }
    if (end.getTime() - start.getTime() > 366 * 86_400_000) {
      throw new BadRequestException("The maximum range is 366 days");
    }
    const sessions = await this.prisma.restaurantStaffSession.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(userId ? { userId } : {}),
        startedAt: { lt: end },
        OR: [{ endedAt: null }, { endedAt: { gt: start } }],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            restaurantRole: true,
            role: true,
            restaurantPayPeriod: true,
            restaurantPayRate: true,
            restaurantStandardMinutesPerDay: true,
            restaurantWorkDaysPerMonth: true,
            restaurantCcssDeductionEnabled: true,
            restaurantCcssDeductionBps: true,
          },
        },
      },
      orderBy: { startedAt: "desc" },
    });
    const earliestSession = sessions.reduce(
      (earliest, session) =>
        session.startedAt < earliest ? session.startedAt : earliest,
      start,
    );
    const relevantUserIds = [
      ...new Set(sessions.map((session) => session.userId)),
    ];
    const events = relevantUserIds.length
      ? await this.prisma.restaurantStaffEvent.findMany({
          where: {
            organizationId: actor.organizationId,
            userId: { in: relevantUserIds },
            createdAt: { gte: earliestSession, lt: end },
          },
          select: {
            userId: true,
            availability: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const eventsByUser = new Map<
      string,
      Array<{
        availability: RestaurantStaffAvailability;
        reason: string | null;
        createdAt: Date;
      }>
    >();
    for (const event of events) {
      const userEvents = eventsByUser.get(event.userId) ?? [];
      userEvents.push(event);
      eventsByUser.set(event.userId, userEvents);
    }
    const now = new Date();
    const maximumUnconfirmedSessionMs = 12 * 60 * 60 * 1000;
    const employeeMap = new Map<
      string,
      {
        userId: string;
        name: string;
        email: string;
        restaurantRole: RestaurantStaffRole | null;
        sessions: number;
        activeMs: number;
        outOfServiceMs: number;
        breakMs: number;
        temporarilyUnavailableMs: number;
        offShiftMs: number;
        firstEntryAt: Date;
        lastExitAt: Date | null;
        openSessions: number;
        restaurantPayPeriod: RestaurantPayPeriod | null;
        restaurantPayRate: number | null;
        restaurantStandardMinutesPerDay: number;
        restaurantWorkDaysPerMonth: number;
        restaurantCcssDeductionEnabled: boolean;
        restaurantCcssDeductionBps: number;
      }
    >();
    const sessionRows = sessions
      .map((session) => {
        const staleAt = new Date(
          session.lastSeenAt.getTime() + maximumUnconfirmedSessionMs,
        );
        const reportedEnd = session.endedAt ?? now;
        const effectiveEnd = new Date(
          Math.min(reportedEnd.getTime(), staleAt.getTime(), now.getTime()),
        );
        if (effectiveEnd <= start || session.startedAt >= end) return null;
        const status = session.endedAt
          ? "CLOSED"
          : staleAt <= now
            ? "STALE"
            : "OPEN";
        const clippedStart = new Date(
          Math.max(session.startedAt.getTime(), start.getTime()),
        );
        const clippedEnd = new Date(
          Math.min(effectiveEnd.getTime(), end.getTime()),
        );
        let activeMs = 0;
        let outOfServiceMs = 0;
        let breakMs = 0;
        let temporarilyUnavailableMs = 0;
        let offShiftMs = 0;
        let availability = session.initialAvailability;
        let cursor = session.startedAt;
        const addInterval = (intervalEnd: Date) => {
          const intervalStartMs = Math.max(
            cursor.getTime(),
            clippedStart.getTime(),
          );
          const intervalEndMs = Math.min(
            intervalEnd.getTime(),
            clippedEnd.getTime(),
          );
          const duration = Math.max(0, intervalEndMs - intervalStartMs);
          if (availability === RestaurantStaffAvailability.AVAILABLE) {
            activeMs += duration;
          } else {
            outOfServiceMs += duration;
            if (availability === RestaurantStaffAvailability.BREAK) {
              breakMs += duration;
            } else if (
              availability ===
              RestaurantStaffAvailability.TEMPORARILY_UNAVAILABLE
            ) {
              temporarilyUnavailableMs += duration;
            } else if (availability === RestaurantStaffAvailability.OFF_SHIFT) {
              offShiftMs += duration;
            }
          }
        };
        for (const event of eventsByUser.get(session.userId) ?? []) {
          if (
            event.createdAt <= session.startedAt ||
            event.createdAt >= effectiveEnd
          ) {
            continue;
          }
          addInterval(event.createdAt);
          cursor = event.createdAt;
          availability = event.availability;
        }
        addInterval(effectiveEnd);
        const exitAt = status === "OPEN" ? null : effectiveEnd;
        const employee = employeeMap.get(session.userId) ?? {
          userId: session.userId,
          name: session.user.name,
          email: session.user.email,
          restaurantRole: session.user.restaurantRole,
          sessions: 0,
          activeMs: 0,
          outOfServiceMs: 0,
          breakMs: 0,
          temporarilyUnavailableMs: 0,
          offShiftMs: 0,
          firstEntryAt: session.startedAt,
          lastExitAt: null,
          openSessions: 0,
          restaurantPayPeriod: session.user.restaurantPayPeriod,
          restaurantPayRate: session.user.restaurantPayRate,
          restaurantStandardMinutesPerDay:
            session.user.restaurantStandardMinutesPerDay,
          restaurantWorkDaysPerMonth: session.user.restaurantWorkDaysPerMonth,
          restaurantCcssDeductionEnabled:
            session.user.restaurantCcssDeductionEnabled,
          restaurantCcssDeductionBps: session.user.restaurantCcssDeductionBps,
        };
        employee.sessions += 1;
        employee.activeMs += activeMs;
        employee.outOfServiceMs += outOfServiceMs;
        employee.breakMs += breakMs;
        employee.temporarilyUnavailableMs += temporarilyUnavailableMs;
        employee.offShiftMs += offShiftMs;
        if (session.startedAt < employee.firstEntryAt) {
          employee.firstEntryAt = session.startedAt;
        }
        if (exitAt && (!employee.lastExitAt || exitAt > employee.lastExitAt)) {
          employee.lastExitAt = exitAt;
        }
        if (status === "OPEN") employee.openSessions += 1;
        employeeMap.set(session.userId, employee);
        return {
          id: session.id,
          userId: session.userId,
          name: session.user.name,
          email: session.user.email,
          restaurantRole: session.user.restaurantRole,
          entryAt: session.startedAt,
          exitAt,
          status,
          activeMs,
          outOfServiceMs,
          breakMs,
          temporarilyUnavailableMs,
          offShiftMs,
        };
      })
      .filter((session): session is NonNullable<typeof session> =>
        Boolean(session),
      );
    const employees = [...employeeMap.values()]
      .map((employee) => {
        const payableMs = employee.activeMs + employee.breakMs;
        const deductedMs =
          employee.temporarilyUnavailableMs + employee.offShiftMs;
        const standardHoursPerDay =
          employee.restaurantStandardMinutesPerDay / 60;
        const hourlyRate =
          employee.restaurantPayRate == null ||
          employee.restaurantPayPeriod == null
            ? null
            : employee.restaurantPayPeriod === RestaurantPayPeriod.HOURLY
              ? employee.restaurantPayRate
              : employee.restaurantPayPeriod === RestaurantPayPeriod.DAILY
                ? employee.restaurantPayRate / standardHoursPerDay
                : employee.restaurantPayRate /
                  (standardHoursPerDay * employee.restaurantWorkDaysPerMonth);
        const grossPay =
          hourlyRate == null
            ? null
            : Math.round((payableMs / 3_600_000) * hourlyRate);
        const ccssDeduction =
          grossPay == null || !employee.restaurantCcssDeductionEnabled
            ? 0
            : Math.round(
                (grossPay * employee.restaurantCcssDeductionBps) / 10_000,
              );
        return {
          ...employee,
          payroll: {
            configured: hourlyRate != null,
            payPeriod: employee.restaurantPayPeriod,
            payRate: employee.restaurantPayRate,
            standardMinutesPerDay: employee.restaurantStandardMinutesPerDay,
            workDaysPerMonth: employee.restaurantWorkDaysPerMonth,
            payableMs,
            deductedMs,
            hourlyRate: hourlyRate == null ? null : Math.round(hourlyRate),
            grossPay,
            ccssDeductionEnabled: employee.restaurantCcssDeductionEnabled,
            ccssDeductionBps: employee.restaurantCcssDeductionBps,
            ccssDeduction,
            netPay:
              grossPay == null ? null : Math.max(0, grossPay - ccssDeduction),
          },
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    const payrollEmployees = employees.filter(
      (employee) => employee.payroll.configured,
    );
    return {
      range: { from: fromDate, to: toDate, timezone },
      filters: { userId: userId || null },
      summary: {
        employees: employees.length,
        sessions: sessionRows.length,
        activeMs: employees.reduce(
          (sum, employee) => sum + employee.activeMs,
          0,
        ),
        outOfServiceMs: employees.reduce(
          (sum, employee) => sum + employee.outOfServiceMs,
          0,
        ),
        payableMs: employees.reduce(
          (sum, employee) => sum + employee.payroll.payableMs,
          0,
        ),
        deductedMs: employees.reduce(
          (sum, employee) => sum + employee.payroll.deductedMs,
          0,
        ),
        payrollConfiguredEmployees: payrollEmployees.length,
        grossPay: payrollEmployees.reduce(
          (sum, employee) => sum + (employee.payroll.grossPay ?? 0),
          0,
        ),
        ccssDeduction: payrollEmployees.reduce(
          (sum, employee) => sum + employee.payroll.ccssDeduction,
          0,
        ),
        netPay: payrollEmployees.reduce(
          (sum, employee) => sum + (employee.payroll.netPay ?? 0),
          0,
        ),
      },
      employees,
      sessions: sessionRows,
    };
  }

  async updateStaffPayroll(
    actor: RestaurantActor,
    userId: string,
    dto: UpdateStaffPayrollDto,
  ) {
    this.requireRestaurantAdmin(actor);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId, active: true },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("User not found");
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        restaurantPayPeriod: dto.payPeriod,
        restaurantPayRate: dto.payRate,
        restaurantStandardMinutesPerDay: dto.standardMinutesPerDay,
        restaurantWorkDaysPerMonth: dto.workDaysPerMonth,
        restaurantCcssDeductionEnabled: dto.ccssDeductionEnabled,
        restaurantCcssDeductionBps: dto.ccssDeductionBps,
      },
      select: {
        id: true,
        name: true,
        restaurantPayPeriod: true,
        restaurantPayRate: true,
        restaurantStandardMinutesPerDay: true,
        restaurantWorkDaysPerMonth: true,
        restaurantCcssDeductionEnabled: true,
        restaurantCcssDeductionBps: true,
      },
    });
  }

  async updateRestaurantRole(
    actor: RestaurantActor,
    userId: string,
    role: RestaurantStaffRole | null,
  ) {
    this.requireRestaurantAdmin(actor);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: actor.organizationId, active: true },
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
      where: { id: userId, organizationId: actor.organizationId, active: true },
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
      const accounts = await this.recoverOpenAccountAssignments(
        tx,
        actor.organizationId,
      );
      return { staff: updated, ...balance, ...accounts };
    });
  }

  async activateStaffOnLogin(
    tx: Prisma.TransactionClient,
    user: { id: string; organizationId: string; restaurantRole: RestaurantStaffRole },
  ) {
    await tx.user.update({
      where: { id: user.id },
      data: { restaurantAvailability: RestaurantStaffAvailability.AVAILABLE },
    });
    await tx.restaurantStaffEvent.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        actorId: user.id,
        availability: RestaurantStaffAvailability.AVAILABLE,
        reason: "Inicio de sesión: entrada a labores",
      },
    });
    if (user.restaurantRole === RestaurantStaffRole.WAITER) {
      await this.rebalanceWaiterTables(tx, user.organizationId);
    }
    await this.recoverOpenAccountAssignments(tx, user.organizationId);
  }

  async updateOwnStaffAvailability(
    actor: RestaurantActor,
    dto: UpdateStaffAvailabilityDto,
  ) {
    if (!actor.restaurantRole) {
      throw new ForbiddenException("Restaurant role required");
    }
    await this.assertOperationalStaffInsideRestaurant(actor, dto);
    const reason = dto.reason?.trim() || null;
    if (dto.availability !== RestaurantStaffAvailability.AVAILABLE && !reason) {
      throw new BadRequestException(
        "Reason required when staff is unavailable",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: {
          id: actor.id,
          organizationId: actor.organizationId,
          active: true,
        },
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
      const accounts = await this.recoverOpenAccountAssignments(
        tx,
        actor.organizationId,
      );

      return { staff: updated, ...balance, ...accounts };
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
        responsibleStaff: {
          select: { id: true, restaurantAvailability: true },
        },
        orders: {
          select: { items: { select: { status: true } } },
        },
      },
    });
    if (!visit) throw new NotFoundException("Restaurant account not found");
    const isAdmin = role === RestaurantStaffRole.RESTAURANT_ADMIN;
    const isResponsibleStaff =
      (role === RestaurantStaffRole.WAITER ||
        role === RestaurantStaffRole.BAR) &&
      (visit.responsibleStaffId === actor.id ||
        (!visit.responsibleStaffId && visit.table.waiterId === actor.id)) &&
      actor.restaurantAvailability === RestaurantStaffAvailability.AVAILABLE;
    if (!isAdmin && !isResponsibleStaff) {
      throw new ForbiddenException(
        "Only the staff member responsible for this account can close it",
      );
    }
    if (visit.occupiesTable === false && !visit.deliveryHandedOffAt) {
      throw new ConflictException(
        "Confirme la entrega a la persona repartidora para cerrar este pedido",
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
    const closedAt = new Date();
    return this.prisma.restaurantVisit.update({
      where: { id: visitId },
      data: {
        status: RestaurantVisitStatus.CLOSED,
        closedAt,
        closedById: actor.id,
        closedByRole: role,
        receiptNumber: this.receiptNumber(visitId, closedAt),
      },
    });
  }

  async updateVisitPayment(
    actor: RestaurantActor,
    visitId: string,
    status: "CONFIRMED" | "REJECTED",
  ) {
    const visit = await this.prisma.restaurantVisit.findFirst({
      where: { id: visitId, organizationId: actor.organizationId },
      include: { table: { select: { waiterId: true } } },
    });
    if (!visit) throw new NotFoundException("Restaurant account not found");
    if (visit.occupiesTable !== false) {
      throw new BadRequestException("This account is not a delivery order");
    }
    const role = this.effectiveRole(actor);
    const allowed =
      role === RestaurantStaffRole.RESTAURANT_ADMIN ||
      ((role === RestaurantStaffRole.WAITER ||
        role === RestaurantStaffRole.BAR) &&
        (visit.responsibleStaffId === actor.id ||
          (!visit.responsibleStaffId && visit.table.waiterId === actor.id)) &&
        actor.restaurantAvailability === RestaurantStaffAvailability.AVAILABLE);
    if (!allowed) {
      throw new ForbiddenException(
        "Only the staff member responsible for this delivery can confirm payment",
      );
    }
    return this.prisma.restaurantVisit.update({
      where: { id: visitId },
      data: {
        paymentStatus:
          status === "CONFIRMED"
            ? RestaurantPaymentStatus.CONFIRMED
            : RestaurantPaymentStatus.REJECTED,
        paymentConfirmedAt: status === "CONFIRMED" ? new Date() : null,
        paymentConfirmedById: status === "CONFIRMED" ? actor.id : null,
      },
    });
  }

  async handoffDelivery(actor: RestaurantActor, visitId: string) {
    const visit = await this.prisma.restaurantVisit.findFirst({
      where: { id: visitId, organizationId: actor.organizationId },
      include: {
        table: { select: { waiterId: true } },
        orders: { select: { items: { select: { status: true } } } },
      },
    });
    if (!visit) throw new NotFoundException("Restaurant account not found");
    if (visit.occupiesTable !== false) {
      throw new BadRequestException("This account is not a delivery order");
    }
    const role = this.effectiveRole(actor);
    const allowed =
      role === RestaurantStaffRole.RESTAURANT_ADMIN ||
      ((role === RestaurantStaffRole.WAITER ||
        role === RestaurantStaffRole.BAR) &&
        (visit.responsibleStaffId === actor.id ||
          (!visit.responsibleStaffId && visit.table.waiterId === actor.id)) &&
        actor.restaurantAvailability === RestaurantStaffAvailability.AVAILABLE);
    if (!allowed) {
      throw new ForbiddenException(
        "Only the staff member responsible for this delivery can close it",
      );
    }
    if (visit.paymentStatus !== RestaurantPaymentStatus.CONFIRMED) {
      throw new ConflictException("Confirm payment before delivery handoff");
    }
    const hasOpenItems = visit.orders.some((order) =>
      order.items.some(
        (item) =>
          item.status !== RestaurantItemStatus.DELIVERED &&
          item.status !== RestaurantItemStatus.CANCELLED,
      ),
    );
    if (hasOpenItems) {
      throw new ConflictException("Deliver or cancel all items before handoff");
    }
    const now = new Date();
    return this.prisma.restaurantVisit.update({
      where: { id: visitId },
      data: {
        deliveryHandedOffAt: now,
        deliveryHandedOffById: actor.id,
        status: RestaurantVisitStatus.CLOSED,
        closedAt: now,
        closedById: actor.id,
        closedByRole: role,
        receiptNumber: this.receiptNumber(visitId, now),
      },
    });
  }

  async transferVisit(
    actor: RestaurantActor,
    visitId: string,
    destinationTableId: string,
  ) {
    const role = this.effectiveRole(actor);
    if (
      role !== RestaurantStaffRole.RESTAURANT_ADMIN &&
      role !== RestaurantStaffRole.WAITER &&
      role !== RestaurantStaffRole.BAR
    ) {
      throw new ForbiddenException("Waiter access required");
    }
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.restaurantVisit.findFirst({
        where: { id: visitId, organizationId: actor.organizationId },
        include: {
          table: true,
          responsibleStaff: {
            select: {
              id: true,
              restaurantRole: true,
              restaurantAvailability: true,
            },
          },
        },
      });
      if (!visit) throw new NotFoundException("Restaurant account not found");
      if (visit.status !== RestaurantVisitStatus.OPEN) {
        throw new ConflictException("Only open accounts can be transferred");
      }
      if (visit.occupiesTable === false) {
        throw new BadRequestException(
          "Los pedidos a domicilio no ocupan ni se trasladan entre posiciones",
        );
      }
      const canMoveAccount =
        role === RestaurantStaffRole.RESTAURANT_ADMIN ||
        ((role === RestaurantStaffRole.WAITER ||
          role === RestaurantStaffRole.BAR) &&
          (visit.responsibleStaffId === actor.id ||
            visit.fallbackStaffId === actor.id ||
            (!visit.responsibleStaffId && visit.table.waiterId === actor.id)));
      if (!canMoveAccount) {
        throw new ForbiddenException(
          "Only the staff member responsible for this account can move it",
        );
      }
      const destination = await tx.restaurantTable.findFirst({
        where: {
          id: destinationTableId,
          organizationId: actor.organizationId,
          active: true,
        },
      });
      if (!destination) throw new NotFoundException("Destination not found");
      if (destination.id === visit.tableId) {
        throw new ConflictException("The account is already at this position");
      }
      const serviceChargeEnabled =
        destination.kind === RestaurantTableKind.DINING &&
        destination.serviceChargeEnabled;
      const currentResponsibleId =
        visit.responsibleStaffId ?? visit.table.waiterId ?? null;
      const currentResponsible = currentResponsibleId
        ? await tx.user.findFirst({
            where: {
              id: currentResponsibleId,
              organizationId: actor.organizationId,
              active: true,
            },
            select: {
              id: true,
              name: true,
              restaurantRole: true,
              restaurantAvailability: true,
            },
          })
        : null;
      const currentAvailable =
        currentResponsible?.restaurantAvailability ===
        RestaurantStaffAvailability.AVAILABLE;
      let responsibleStaffId = currentAvailable ? currentResponsible!.id : null;
      let fallbackStaffId: string | null = null;

      if (destination.kind === RestaurantTableKind.DINING) {
        const destinationWaiter = destination.waiterId
          ? await tx.user.findFirst({
              where: {
                id: destination.waiterId,
                organizationId: actor.organizationId,
                active: true,
                restaurantRole: RestaurantStaffRole.WAITER,
                restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
              },
              select: { id: true },
            })
          : null;
        if (!destinationWaiter) {
          throw new ConflictException(
            "The destination table has no available waiter",
          );
        }
        responsibleStaffId = destinationWaiter.id;
      } else if (destination.kind === RestaurantTableKind.BAR_SEAT) {
        const bartenders = await tx.user.findMany({
          where: {
            organizationId: actor.organizationId,
            active: true,
            restaurantRole: RestaurantStaffRole.BAR,
            restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
          },
          select: { id: true, name: true },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        });
        const bartenderLoads = await Promise.all(
          bartenders.map(async (bartender) => ({
            ...bartender,
            load: await tx.restaurantVisit.count({
              where: {
                responsibleStaffId: bartender.id,
                status: RestaurantVisitStatus.OPEN,
              },
            }),
          })),
        );
        bartenderLoads.sort((left, right) => left.load - right.load);
        const bartender = bartenderLoads[0] ?? null;
        const originalWaiterAvailable =
          currentAvailable &&
          currentResponsible?.restaurantRole === RestaurantStaffRole.WAITER;
        if (bartender) {
          responsibleStaffId = bartender.id;
          fallbackStaffId = originalWaiterAvailable
            ? currentResponsible!.id
            : null;
        } else if (role === RestaurantStaffRole.RESTAURANT_ADMIN) {
          responsibleStaffId = actor.id;
          fallbackStaffId = originalWaiterAvailable
            ? currentResponsible!.id
            : null;
        } else {
          throw new ConflictException(
            "No bartender is available for this bar account",
          );
        }
      } else if (!responsibleStaffId) {
        throw new ConflictException(
          "No available staff member can retain responsibility for this account",
        );
      }

      const updated = await tx.restaurantVisit.update({
        where: { id: visit.id },
        data: {
          tableId: destination.id,
          serviceChargeEnabled,
          responsibleStaffId,
          fallbackStaffId,
        },
      });
      await tx.restaurantOrder.updateMany({
        where: { visitId: visit.id },
        data: { tableId: destination.id },
      });
      await tx.restaurantVisitTransfer.create({
        data: {
          visitId: visit.id,
          fromTableId: visit.tableId,
          toTableId: destination.id,
          actorId: actor.id,
        },
      });
      const activeAccountsAtDestination = await tx.restaurantVisit.count({
        where: {
          tableId: destination.id,
          status: RestaurantVisitStatus.OPEN,
          occupiesTable: true,
        },
      });
      return {
        ...updated,
        destination,
        responsibleStaffId,
        activeAccountsAtDestination,
      };
    });
  }

  private async availableStations(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        active: true,
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
      tableName: table.name,
      tableKind: table.kind,
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

  async inventory(actor: RestaurantActor) {
    const role = this.requireInventoryAccess(actor);
    const [categories, products, menuItems] = await Promise.all([
      this.prisma.restaurantInventoryCategory.findMany({
        where: { organizationId: actor.organizationId, active: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.restaurantInventoryProduct.findMany({
        where: { organizationId: actor.organizationId },
        include: {
          category: { select: { id: true, name: true } },
          menuItem: { select: { id: true, name: true } },
          movements: { orderBy: { occurredAt: "desc" }, take: 10 },
          weighings: { orderBy: { measuredAt: "desc" }, take: 10 },
        },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      }),
      this.prisma.restaurantMenuItem.findMany({
        where: { organizationId: actor.organizationId, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    const alerts = products
      .filter(
        (product) =>
          product.active && product.quantity <= product.minimumQuantity,
      )
      .map((product) => ({
        productId: product.id,
        name: product.name,
        quantity: product.quantity,
        minimumQuantity: product.minimumQuantity,
        presentation: product.presentation,
      }));
    return {
      categories,
      products,
      menuItems,
      alerts,
      summary: {
        activeProducts: products.filter((product) => product.active).length,
        lowStockProducts: alerts.length,
        inventoryCost: products
          .filter((product) => product.active)
          .reduce(
            (total, product) => total + product.quantity * product.unitCost,
            0,
          ),
      },
      permissions: {
        canManageCatalog: true,
        isBar: role === RestaurantStaffRole.BAR,
        canRecordMovements: true,
      },
    };
  }

  async addInventoryCategory(
    actor: RestaurantActor,
    dto: CreateInventoryCategoryDto,
  ) {
    this.requireInventoryAccess(actor, true);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("Category name required");
    const existing = await this.prisma.restaurantInventoryCategory.findFirst({
      where: { organizationId: actor.organizationId, name },
    });
    if (existing) throw new ConflictException("Inventory category already exists");
    return this.prisma.restaurantInventoryCategory.create({
      data: { organizationId: actor.organizationId, name },
    });
  }

  async addInventoryProduct(
    actor: RestaurantActor,
    dto: CreateInventoryProductDto,
  ) {
    this.requireInventoryAccess(actor, true);
    const name = dto.name.trim();
    const presentation = dto.presentation.trim();
    if (!name || !presentation) {
      throw new BadRequestException("Name and presentation are required");
    }
    if (
      dto.productType === RestaurantInventoryProductType.LIQUOR &&
      (!dto.liquorBrand?.trim() || dto.liquorInitialTareGrams === undefined)
    ) {
      throw new BadRequestException("Liquor brand and initial tare are required");
    }
    const [category, menuItem] = await Promise.all([
      this.prisma.restaurantInventoryCategory.findFirst({
        where: {
          id: dto.categoryId,
          organizationId: actor.organizationId,
          active: true,
        },
      }),
      dto.menuItemId
        ? this.prisma.restaurantMenuItem.findFirst({
            where: { id: dto.menuItemId, organizationId: actor.organizationId },
          })
        : Promise.resolve(null),
    ]);
    if (!category) throw new NotFoundException("Inventory category not found");
    if (dto.menuItemId && !menuItem) {
      throw new NotFoundException("Menu item not found");
    }
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.restaurantInventoryProduct.create({
        data: {
          organizationId: actor.organizationId,
          categoryId: dto.categoryId,
          menuItemId: dto.menuItemId ?? null,
          name,
          productType: dto.productType,
          presentation,
          quantity: dto.quantity,
          minimumQuantity: dto.minimumQuantity,
          unitCost: dto.unitCost,
          receivedAt: new Date(dto.receivedAt),
          liquorBrand: dto.liquorBrand?.trim() || null,
          liquorInitialTareGrams: dto.liquorInitialTareGrams ?? null,
        },
      });
      if (dto.quantity > 0) {
        await tx.restaurantInventoryMovement.create({
          data: {
            organizationId: actor.organizationId,
            productId: product.id,
            type: RestaurantInventoryMovementType.ENTRY,
            quantityDelta: dto.quantity,
            unitCost: dto.unitCost,
            occurredAt: new Date(dto.receivedAt),
            note: "Inventario inicial",
          },
        });
      }
      return product;
    });
  }

  async updateInventoryProduct(
    actor: RestaurantActor,
    id: string,
    dto: UpdateInventoryProductDto,
  ) {
    this.requireInventoryAccess(actor, true);
    const current = await this.prisma.restaurantInventoryProduct.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!current) throw new NotFoundException("Inventory product not found");
    if (dto.categoryId) {
      const category = await this.prisma.restaurantInventoryCategory.findFirst({
        where: { id: dto.categoryId, organizationId: actor.organizationId },
      });
      if (!category) throw new NotFoundException("Inventory category not found");
    }
    if (dto.menuItemId) {
      const menuItem = await this.prisma.restaurantMenuItem.findFirst({
        where: { id: dto.menuItemId, organizationId: actor.organizationId },
      });
      if (!menuItem) throw new NotFoundException("Menu item not found");
    }
    return this.prisma.restaurantInventoryProduct.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.presentation !== undefined
          ? { presentation: dto.presentation.trim() }
          : {}),
        ...(dto.receivedAt ? { receivedAt: new Date(dto.receivedAt) } : {}),
        ...(dto.liquorBrand !== undefined
          ? { liquorBrand: dto.liquorBrand?.trim() || null }
          : {}),
      },
    });
  }

  async addInventoryMovement(
    actor: RestaurantActor,
    productId: string,
    dto: CreateInventoryMovementDto,
  ) {
    this.requireInventoryAccess(actor, true);
    if (dto.type === RestaurantInventoryMovementType.CONSUMPTION) {
      throw new BadRequestException("Consumption movements are generated from orders");
    }
    if (dto.quantityDelta === 0) {
      throw new BadRequestException("Movement quantity cannot be zero");
    }
    if (
      dto.type === RestaurantInventoryMovementType.ENTRY &&
      dto.quantityDelta < 0
    ) {
      throw new BadRequestException("Entries must increase inventory");
    }
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.restaurantInventoryProduct.findFirst({
        where: { id: productId, organizationId: actor.organizationId },
      });
      if (!product) throw new NotFoundException("Inventory product not found");
      const quantity = product.quantity + dto.quantityDelta;
      if (quantity < 0) {
        throw new ConflictException("Movement would leave negative inventory");
      }
      await tx.restaurantInventoryProduct.update({
        where: { id: productId },
        data: {
          quantity,
          ...(dto.unitCost !== undefined ? { unitCost: dto.unitCost } : {}),
        },
      });
      return tx.restaurantInventoryMovement.create({
        data: {
          organizationId: actor.organizationId,
          productId,
          type: dto.type,
          quantityDelta: dto.quantityDelta,
          unitCost: dto.unitCost,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
          note: dto.note?.trim() || null,
        },
      });
    });
  }

  async addLiquorWeighing(
    actor: RestaurantActor,
    productId: string,
    dto: CreateLiquorWeighingDto,
  ) {
    this.requireInventoryAccess(actor, true);
    const measuredAt = dto.measuredAt ? new Date(dto.measuredAt) : new Date();
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.restaurantInventoryProduct.findFirst({
        where: { id: productId, organizationId: actor.organizationId },
      });
      if (!product) throw new NotFoundException("Inventory product not found");
      if (
        product.productType !== RestaurantInventoryProductType.LIQUOR ||
        product.liquorInitialTareGrams === null
      ) {
        throw new BadRequestException("This product does not use liquor weighing");
      }
      if (dto.grossWeightGrams < product.liquorInitialTareGrams) {
        throw new BadRequestException("Gross weight cannot be below the tare");
      }
      const previous = await tx.restaurantLiquorWeighing.findFirst({
        where: { productId },
        orderBy: { measuredAt: "desc" },
      });
      const netWeightGrams =
        dto.grossWeightGrams - product.liquorInitialTareGrams;
      const aggregate = product.menuItemId
        ? await tx.restaurantOrderItem.aggregate({
            where: {
              menuItemId: product.menuItemId,
              status: RestaurantItemStatus.DELIVERED,
              deliveredAt: {
                ...(previous ? { gt: previous.measuredAt } : {}),
                lte: measuredAt,
              },
              order: { organizationId: actor.organizationId },
            },
            _sum: { quantity: true },
          })
        : null;
      return tx.restaurantLiquorWeighing.create({
        data: {
          organizationId: actor.organizationId,
          productId,
          grossWeightGrams: dto.grossWeightGrams,
          netWeightGrams,
          previousNetWeightGrams: previous?.netWeightGrams ?? null,
          consumedWeightGrams: previous
            ? Math.max(0, previous.netWeightGrams - netWeightGrams)
            : null,
          relatedOrderQuantity: aggregate?._sum.quantity ?? 0,
          measuredAt,
          note: dto.note?.trim() || null,
        },
      });
    });
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

  async invoiceRequests(actor: RestaurantActor) {
    this.requireRestaurantAdmin(actor);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { restaurantRetentionDays: true },
    });
    const cutoff = new Date(
      Date.now() - organization.restaurantRetentionDays * 86_400_000,
    );
    return this.prisma.restaurantVisit.findMany({
      where: {
        organizationId: actor.organizationId,
        OR: [
          { status: RestaurantVisitStatus.OPEN },
          { closedAt: { gte: cutoff } },
        ],
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
            restaurantAccessEnabled: true,
            restaurantDisplayName: true,
            restaurantHeaderImageData: true,
            restaurantUseHeaderImage: true,
            restaurantRetentionDays: true,
            restaurantOrderCorrectionMinutes: true,
            restaurantMenuBackgroundImageData: true,
            restaurantMenuBackgroundEnabled: true,
            restaurantMenuBackgroundPosition: true,
            restaurantMenuBackgroundSize: true,
            restaurantLatitude: true,
            restaurantLongitude: true,
            restaurantOrderRadiusMeters: true,
          },
        },
        waiter: { select: { id: true, name: true } },
      },
    });
    if (!table?.active) throw new NotFoundException("Table not found");
    if (table.organization.restaurantAccessEnabled === false) {
      throw new ForbiddenException(
        "Restaurant ordering is temporarily unavailable",
      );
    }
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
          where: {
            tableId: table.id,
            status: RestaurantVisitStatus.OPEN,
            occupiesTable: true,
          },
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
      branding: {
        displayName:
          table.organization.restaurantDisplayName || table.organization.name,
        headerImageData: table.organization.restaurantHeaderImageData,
        useHeaderImage: table.organization.restaurantUseHeaderImage,
        menuBackgroundImageData:
          table.organization.restaurantMenuBackgroundImageData,
        menuBackgroundEnabled:
          table.organization.restaurantMenuBackgroundEnabled,
        menuBackgroundPosition:
          table.organization.restaurantMenuBackgroundPosition,
        menuBackgroundSize: table.organization.restaurantMenuBackgroundSize,
      },
      table: table.name,
      tableKind: table.kind,
      locationVerificationRequired: false,
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

  async recordQrAccess(code: string, dto: RecordQrAccessDto) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { code },
      include: {
        organization: {
          select: {
            restaurantAccessEnabled: true,
            restaurantLatitude: true,
            restaurantLongitude: true,
            restaurantOrderRadiusMeters: true,
          },
        },
      },
    });
    if (!table?.active) throw new NotFoundException("Table not found");
    if (!table.organization.restaurantAccessEnabled) {
      throw new ForbiddenException(
        "Restaurant ordering is temporarily unavailable",
      );
    }
    await this.prisma.restaurantQrAccess.create({
      data: {
        organizationId: table.organizationId,
        tableId: table.id,
        sessionKey: dto.sessionKey,
        insideLocal: null,
        distanceMeters: null,
        accuracyMeters: null,
      },
    });
    return {
      verificationRequired: false,
      insideLocal: null,
      distanceMeters: null,
      radiusMeters: null,
      mode: "ONSITE",
    };
  }

  async placeOrder(
    code: string,
    dto: PlaceOrderDto,
    responsibleActor?: RestaurantActor,
  ) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { code },
      include: {
        organization: {
          select: {
            restaurantAccessEnabled: true,
            restaurantLatitude: true,
            restaurantLongitude: true,
            restaurantOrderRadiusMeters: true,
          },
        },
      },
    });
    if (!table?.active) throw new NotFoundException("Table not found");
    if (table.organization?.restaurantAccessEnabled === false) {
      throw new ForbiddenException(
        "Restaurant ordering is temporarily unavailable",
      );
    }
    const isDelivery = dto.fulfillment === RestaurantFulfillment.DELIVERY;
    const deliveryPhone = dto.deliveryPhone?.trim();
    const deliveryAddress = dto.deliveryAddress?.trim();
    if (isDelivery && (!deliveryPhone || !deliveryAddress)) {
      throw new BadRequestException(
        "El teléfono y la dirección son obligatorios para entrega a domicilio",
      );
    }
    if (
      !isDelivery &&
      dto.items.some(
        (item) => item.fulfillment === RestaurantFulfillment.DELIVERY,
      )
    ) {
      throw new BadRequestException(
        "La entrega a domicilio debe seleccionarse para toda la orden",
      );
    }
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
            "La cuenta anterior fue cerrada o trasladada a otra posición",
          );
        }
        if (
          visit &&
          ((visit.occupiesTable !== false && isDelivery) ||
            (visit.occupiesTable === false && !isDelivery))
        ) {
          throw new BadRequestException(
            "La modalidad de la cuenta anterior no coincide con este pedido",
          );
        }
        if (visit && visit.occupiesTable === false) {
          throw new ConflictException(
            "Los pedidos a domicilio no permiten agregar productos después del envío",
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
          let responsibleStaffId = responsibleActor?.id ?? table.waiterId;
          if (!responsibleActor && isDelivery) {
            const availableStaff = await tx.user.findMany({
              where: {
                organizationId: table.organizationId,
                active: true,
                restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
                restaurantRole: {
                  in: [RestaurantStaffRole.WAITER, RestaurantStaffRole.BAR],
                },
              },
              select: { id: true, restaurantRole: true },
              orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
            });
            const waiters = availableStaff.filter(
              (candidate) =>
                candidate.restaurantRole === RestaurantStaffRole.WAITER,
            );
            const candidates = waiters.length
              ? waiters
              : availableStaff.filter(
                  (candidate) =>
                    candidate.restaurantRole === RestaurantStaffRole.BAR,
                );
            const loads = await Promise.all(
              candidates.map(async (candidate) => ({
                id: candidate.id,
                load: await tx.restaurantVisit.count({
                  where: {
                    responsibleStaffId: candidate.id,
                    status: RestaurantVisitStatus.OPEN,
                  },
                }),
              })),
            );
            loads.sort((left, right) => left.load - right.load);
            responsibleStaffId = loads[0]?.id ?? null;
          } else if (
            !responsibleActor &&
            table.kind === RestaurantTableKind.DINING
          ) {
            const assignedWaiter = table.waiterId
              ? await tx.user.findFirst({
                  where: {
                    id: table.waiterId,
                    organizationId: table.organizationId,
                    active: true,
                    restaurantRole: RestaurantStaffRole.WAITER,
                    restaurantAvailability:
                      RestaurantStaffAvailability.AVAILABLE,
                  },
                  select: { id: true },
                })
              : null;
            responsibleStaffId = assignedWaiter?.id ?? null;
            if (!responsibleStaffId) {
              const coverage = await this.selectAccountCoverageStaff(
                tx,
                table.organizationId,
                table.kind,
              );
              responsibleStaffId = coverage?.id ?? null;
            }
            if (!responsibleStaffId) {
              throw new ConflictException(
                "No hay personal disponible para atender esta mesa",
              );
            }
          } else if (
            !responsibleActor &&
            (table.kind === RestaurantTableKind.BAR_SEAT ||
              table.kind === RestaurantTableKind.TAKEOUT_STATION)
          ) {
            const preferredRole =
              table.kind === RestaurantTableKind.BAR_SEAT
                ? RestaurantStaffRole.BAR
                : undefined;
            const staff = await tx.user.findMany({
              where: {
                organizationId: table.organizationId,
                active: true,
                restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
                restaurantRole: preferredRole
                  ? preferredRole
                  : {
                      in: [RestaurantStaffRole.BAR, RestaurantStaffRole.WAITER],
                    },
              },
              select: { id: true },
              orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
            });
            const loads = await Promise.all(
              staff.map(async (candidate) => ({
                id: candidate.id,
                load: await tx.restaurantVisit.count({
                  where: {
                    responsibleStaffId: candidate.id,
                    status: RestaurantVisitStatus.OPEN,
                  },
                }),
              })),
            );
            loads.sort((left, right) => left.load - right.load);
            responsibleStaffId = loads[0]?.id ?? null;
            if (
              table.kind === RestaurantTableKind.BAR_SEAT &&
              !responsibleStaffId
            ) {
              throw new ConflictException(
                "Bar service is temporarily unavailable",
              );
            }
          }
          visit = await tx.restaurantVisit.create({
            data: {
              organizationId: table.organizationId,
              tableId: table.id,
              taxRateBps: settings.restaurantTaxRateBps,
              taxIncluded: settings.restaurantTaxIncluded,
              serviceRateBps: settings.restaurantServiceRateBps,
              serviceChargeEnabled: isDelivery
                ? false
                : table.serviceChargeEnabled,
              occupiesTable: !isDelivery,
              deliveryPhone: isDelivery ? deliveryPhone : null,
              deliveryAddress: isDelivery ? deliveryAddress : null,
              paymentStatus: isDelivery
                ? RestaurantPaymentStatus.PENDING
                : RestaurantPaymentStatus.NOT_REQUIRED,
              responsibleStaffId,
            },
          });
        }
        const defaultFulfillment = isDelivery
          ? RestaurantFulfillment.DELIVERY
          : table.kind === RestaurantTableKind.TAKEOUT_STATION
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
              fulfillment: isDelivery
                ? RestaurantFulfillment.DELIVERY
                : table.kind === RestaurantTableKind.TAKEOUT_STATION
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
            order: {
              organizationId: table.organizationId,
              OR: [
                { visitId: null },
                {
                  visit: {
                    paymentStatus: {
                      in: [
                        RestaurantPaymentStatus.NOT_REQUIRED,
                        RestaurantPaymentStatus.CONFIRMED,
                      ],
                    },
                  },
                },
              ],
            },
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

  async correctGuestOrder(accessCode: string, dto: CorrectGuestOrderDto) {
    const ids = dto.items.map((item) => item.menuItemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException("No repita productos en la corrección");
    }
    const visit = await this.prisma.restaurantVisit.findUnique({
      where: { accessCode },
      include: {
        organization: {
          select: { restaurantOrderCorrectionMinutes: true },
        },
        table: { select: { kind: true } },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { items: true },
        },
      },
    });
    if (!visit) throw new NotFoundException("Cuenta no encontrada");
    const latest = visit.orders[0];
    if (!latest || latest.id !== dto.orderId) {
      throw new ConflictException("Solo puede corregir el pedido más reciente");
    }
    if (latest.lastCorrectionRequestId === dto.requestId) {
      return this.guestOrder(accessCode);
    }
    if (
      visit.status !== RestaurantVisitStatus.OPEN ||
      visit.occupiesTable === false
    ) {
      throw new ConflictException(
        "Este pedido solo puede ser corregido con ayuda del personal",
      );
    }
    const correctionMinutes =
      visit.organization?.restaurantOrderCorrectionMinutes ?? 2;
    const deadline =
      latest.createdAt.getTime() + correctionMinutes * 60_000;
    if (correctionMinutes === 0 || Date.now() >= deadline) {
      throw new ConflictException(
        "El tiempo para corregir el pedido ya terminó",
      );
    }
    const activeItems = latest.items.filter(
      (item) => item.status !== RestaurantItemStatus.CANCELLED,
    );
    if (
      activeItems.length === 0 ||
      activeItems.some((item) => item.status !== RestaurantItemStatus.RECEIVED)
    ) {
      throw new ConflictException(
        "El pedido ya fue aceptado; solicite ayuda al mesero",
      );
    }
    const availableStations = await this.availableStations(
      visit.organizationId,
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
        organizationId: visit.organizationId,
        active: true,
        station: { in: stations },
      },
    });
    if (menu.length !== ids.length) {
      throw new BadRequestException("Uno de los productos ya no está disponible");
    }
    const byId = new Map(menu.map((item) => [item.id, item]));

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.restaurantOrder.findFirst({
        where: { id: latest.id, visitId: visit.id },
        include: { items: true },
      });
      if (!current) throw new NotFoundException("Pedido no encontrado");
      if (current.lastCorrectionRequestId === dto.requestId) return;
      const currentActive = current.items.filter(
        (item) => item.status !== RestaurantItemStatus.CANCELLED,
      );
      if (
        currentActive.length === 0 ||
        currentActive.some(
          (item) => item.status !== RestaurantItemStatus.RECEIVED,
        )
      ) {
        throw new ConflictException(
          "El pedido ya fue aceptado; solicite ayuda al mesero",
        );
      }
      const cancelled = await tx.restaurantOrderItem.updateMany({
        where: {
          id: { in: currentActive.map((item) => item.id) },
          status: RestaurantItemStatus.RECEIVED,
        },
        data: {
          status: RestaurantItemStatus.CANCELLED,
          cancelledByGuestCorrection: true,
        },
      });
      if (cancelled.count !== currentActive.length) {
        throw new ConflictException(
          "El pedido fue aceptado mientras se corregía; solicite ayuda al mesero",
        );
      }
      await tx.restaurantItemEvent.createMany({
        data: currentActive.map((item) => ({
          itemId: item.id,
          status: RestaurantItemStatus.CANCELLED,
          note: "Cancelado por corrección del cliente",
        })),
      });
      const defaultFulfillment =
        visit.table.kind === RestaurantTableKind.TAKEOUT_STATION
          ? RestaurantFulfillment.TAKEOUT
          : current.fulfillment;
      const selectedItems = dto.items.map(
        ({ menuItemId, quantity, fulfillment }) => ({
          item: byId.get(menuItemId)!,
          menuItemId,
          quantity,
          fulfillment:
            visit.table.kind === RestaurantTableKind.TAKEOUT_STATION
              ? RestaurantFulfillment.TAKEOUT
              : (fulfillment ?? defaultFulfillment),
        }),
      );
      for (const selected of selectedItems) {
        await tx.restaurantOrderItem.create({
          data: {
            orderId: current.id,
            menuItemId: selected.menuItemId,
            quantity: selected.quantity,
            name: selected.item.name,
            price: selected.item.price,
            station: selected.item.station,
            course: selected.item.course,
            fulfillment: selected.fulfillment,
            prepMinutes: selected.item.prepMinutes,
            events: {
              create: {
                status: RestaurantItemStatus.RECEIVED,
                note: "Producto agregado por corrección del cliente",
              },
            },
          },
        });
      }
      const promotion = current.promotionId
        ? await tx.restaurantPromotion.findFirst({
            where: {
              id: current.promotionId,
              organizationId: visit.organizationId,
            },
          })
        : null;
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
      await tx.restaurantOrder.update({
        where: { id: current.id },
        data: {
          promotionCredit,
          expectedMinutes: baseMinutes,
          thresholdMinutes: Math.max(baseMinutes + 5, Math.round(baseMinutes * 1.35)),
          correctionCount: { increment: 1 },
          lastCorrectionRequestId: dto.requestId,
          correctionRequestedAt: null,
          correctionRequestNote: null,
        },
      });
    });
    return this.guestOrder(accessCode);
  }

  async correctStaffOrder(
    actor: RestaurantActor,
    orderId: string,
    dto: CorrectStaffOrderDto,
  ) {
    const role = this.effectiveRole(actor);
    const isAdmin = role === RestaurantStaffRole.RESTAURANT_ADMIN;
    if (
      !isAdmin &&
      role !== RestaurantStaffRole.WAITER &&
      role !== RestaurantStaffRole.BAR
    ) {
      throw new ForbiddenException(
        "Solo el responsable de la cuenta puede modificar el pedido",
      );
    }
    if (
      !isAdmin &&
      actor.restaurantAvailability !== RestaurantStaffAvailability.AVAILABLE
    ) {
      throw new ForbiddenException("El empleado no está disponible");
    }
    const ids = dto.items.map((item) => item.menuItemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException("No repita productos en la corrección");
    }
    const order = await this.prisma.restaurantOrder.findFirst({
      where: { id: orderId, organizationId: actor.organizationId },
      include: {
        table: { select: { waiterId: true, kind: true } },
        visit: { select: { id: true, status: true, responsibleStaffId: true } },
        items: true,
      },
    });
    if (!order?.visit || order.visit.status !== RestaurantVisitStatus.OPEN) {
      throw new ConflictException("La cuenta ya no está abierta");
    }
    const isResponsible =
      order.visit.responsibleStaffId === actor.id ||
      (!order.visit.responsibleStaffId && order.table.waiterId === actor.id);
    if (!isAdmin && !isResponsible) {
      throw new ForbiddenException(
        "Solo el empleado encargado de la cuenta puede modificar el pedido",
      );
    }
    if (order.lastCorrectionRequestId === dto.requestId) {
      return { id: order.id, correctionCount: order.correctionCount };
    }
    const activeItems = order.items.filter(
      (item) => item.status !== RestaurantItemStatus.CANCELLED,
    );
    const editableStatuses: RestaurantItemStatus[] = [
      RestaurantItemStatus.RECEIVED,
      RestaurantItemStatus.ACCEPTED,
    ];
    if (
      activeItems.length === 0 ||
      activeItems.some((item) => !editableStatuses.includes(item.status))
    ) {
      throw new ConflictException(
        "La preparación ya comenzó; el pedido no puede modificarse desde este control",
      );
    }
    const availableStations = await this.availableStations(actor.organizationId);
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
        organizationId: actor.organizationId,
        active: true,
        station: { in: stations },
      },
    });
    if (menu.length !== ids.length) {
      throw new BadRequestException("Uno de los productos ya no está disponible");
    }
    const byId = new Map(menu.map((item) => [item.id, item]));
    const reason = dto.reason?.trim();

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.restaurantOrder.findFirst({
        where: { id: order.id, visitId: order.visit!.id },
        include: { items: true },
      });
      if (!current) throw new NotFoundException("Pedido no encontrado");
      if (current.lastCorrectionRequestId === dto.requestId) {
        return { id: current.id, correctionCount: current.correctionCount };
      }
      const currentActive = current.items.filter(
        (item) => item.status !== RestaurantItemStatus.CANCELLED,
      );
      if (
        currentActive.length === 0 ||
        currentActive.some((item) => !editableStatuses.includes(item.status))
      ) {
        throw new ConflictException(
          "La preparación comenzó mientras se modificaba el pedido",
        );
      }
      const cancelled = await tx.restaurantOrderItem.updateMany({
        where: {
          id: { in: currentActive.map((item) => item.id) },
          status: { in: editableStatuses },
        },
        data: {
          status: RestaurantItemStatus.CANCELLED,
          cancelledByGuestCorrection: true,
        },
      });
      if (cancelled.count !== currentActive.length) {
        throw new ConflictException(
          "La preparación comenzó mientras se modificaba el pedido",
        );
      }
      await tx.restaurantItemEvent.createMany({
        data: currentActive.map((item) => ({
          itemId: item.id,
          actorId: actor.id,
          status: RestaurantItemStatus.CANCELLED,
          note: `Reemplazado por corrección del empleado${reason ? `: ${reason}` : ""}`,
        })),
      });
      const defaultFulfillment =
        order.table.kind === RestaurantTableKind.TAKEOUT_STATION
          ? RestaurantFulfillment.TAKEOUT
          : current.fulfillment;
      const selectedItems = dto.items.map(
        ({ menuItemId, quantity, fulfillment }) => ({
          item: byId.get(menuItemId)!,
          menuItemId,
          quantity,
          fulfillment:
            order.table.kind === RestaurantTableKind.TAKEOUT_STATION
              ? RestaurantFulfillment.TAKEOUT
              : (fulfillment ?? defaultFulfillment),
        }),
      );
      for (const selected of selectedItems) {
        await tx.restaurantOrderItem.create({
          data: {
            orderId: current.id,
            menuItemId: selected.menuItemId,
            quantity: selected.quantity,
            name: selected.item.name,
            price: selected.item.price,
            station: selected.item.station,
            course: selected.item.course,
            fulfillment: selected.fulfillment,
            prepMinutes: selected.item.prepMinutes,
            events: {
              create: {
                actorId: actor.id,
                status: RestaurantItemStatus.RECEIVED,
                note: `Producto agregado por corrección del empleado${reason ? `: ${reason}` : ""}`,
              },
            },
          },
        });
      }
      const promotion = current.promotionId
        ? await tx.restaurantPromotion.findFirst({
            where: { id: current.promotionId, organizationId: actor.organizationId },
          })
        : null;
      const eligibleSubtotal = promotion
        ? selectedItems
            .filter(
              ({ item }) =>
                (!promotion.menuItemId || promotion.menuItemId === item.id) &&
                (!promotion.productType || promotion.productType === item.productType),
            )
            .reduce((sum, { item, quantity }) => sum + item.price * quantity, 0)
        : 0;
      const promotionCredit = promotion
        ? Math.min(promotion.creditAmount, eligibleSubtotal)
        : 0;
      const baseMinutes = Math.max(
        5,
        ...selectedItems.map(({ item }) => item.prepMinutes ?? 5),
      );
      const updated = await tx.restaurantOrder.update({
        where: { id: current.id },
        data: {
          promotionCredit,
          expectedMinutes: baseMinutes,
          thresholdMinutes: Math.max(baseMinutes + 5, Math.round(baseMinutes * 1.35)),
          correctionCount: { increment: 1 },
          lastCorrectionRequestId: dto.requestId,
          correctionRequestedAt: null,
          correctionRequestNote: null,
        },
        select: { id: true, correctionCount: true },
      });
      return updated;
    });
  }

  async requestGuestOrderCorrection(
    accessCode: string,
    dto: RequestGuestOrderCorrectionDto,
  ) {
    const visit = await this.prisma.restaurantVisit.findUnique({
      where: { accessCode },
      include: {
        orders: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!visit || visit.status !== RestaurantVisitStatus.OPEN) {
      throw new NotFoundException("Cuenta abierta no encontrada");
    }
    const latest = visit.orders[0];
    if (!latest || latest.id !== dto.orderId) {
      throw new ConflictException("Solo puede solicitar cambios al pedido más reciente");
    }
    if (visit.occupiesTable === false) {
      throw new ConflictException(
        "Los cambios de entrega a domicilio requieren contacto directo con el restaurante",
      );
    }
    return this.prisma.restaurantOrder.update({
      where: { id: latest.id },
      data: {
        correctionRequestedAt: new Date(),
        correctionRequestNote:
          dto.note?.trim() || "El cliente solicita ayuda para corregir su pedido",
      },
      select: { id: true, correctionRequestedAt: true },
    });
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
    const tax =
      settings.taxRateBps === 0
        ? 0
        : settings.taxIncluded
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
        organization: {
          select: {
            name: true,
            restaurantDisplayName: true,
            restaurantHeaderImageData: true,
            restaurantUseHeaderImage: true,
            restaurantRetentionDays: true,
            restaurantOrderCorrectionMinutes: true,
          },
        },
        responsibleStaff: {
          select: { id: true, name: true, restaurantRole: true },
        },
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
    if (
      visit.status === RestaurantVisitStatus.CLOSED &&
      visit.closedAt &&
      visit.closedAt.getTime() <
        Date.now() - visit.organization.restaurantRetentionDays * 86_400_000
    ) {
      throw new NotFoundException("Receipt retention period expired");
    }
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
    const publicOrders = visit.orders.map((order) => ({
      ...order,
      items: order.items.filter(
        (item) => !item.cancelledByGuestCorrection,
      ),
    }));
    const items = publicOrders.flatMap((order) =>
      order.items.map((item) => ({ ...item, orderCreatedAt: order.createdAt })),
    );
    const latestOrder = visit.orders.at(-1) ?? null;
    const latestActiveItems =
      latestOrder?.items.filter(
        (item) => item.status !== RestaurantItemStatus.CANCELLED,
      ) ?? [];
    const correctionMinutes =
      visit.organization?.restaurantOrderCorrectionMinutes ?? 2;
    const correctionDeadline = latestOrder
      ? new Date(
          latestOrder.createdAt.getTime() + correctionMinutes * 60_000,
        )
      : null;
    const correctionBlockedReason = !latestOrder
      ? "NO_ORDER"
      : visit.status !== RestaurantVisitStatus.OPEN
        ? "CLOSED"
        : visit.occupiesTable === false
          ? "DELIVERY"
          : correctionMinutes === 0
            ? "DISABLED"
            : latestActiveItems.length === 0 ||
                latestActiveItems.some(
                  (item) => item.status !== RestaurantItemStatus.RECEIVED,
                )
              ? "ACCEPTED"
              : correctionDeadline && correctionDeadline <= now
                ? "TIME_EXPIRED"
                : null;
    const correctionMenu = menu
      .filter((item) =>
        item.station === RestaurantStation.KITCHEN
          ? availableStations.has(RestaurantStaffRole.KITCHEN)
          : availableStations.has(RestaurantStaffRole.BAR),
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        station: item.station,
        course: item.course,
      }));
    return {
      id: visit.id,
      accessCode: visit.accessCode,
      status: visit.status,
      createdAt: visit.openedAt,
      closedAt: visit.closedAt,
      receiptNumber: visit.receiptNumber,
      restaurant: visit.organization?.name ?? "Restaurante",
      branding: {
        displayName:
          visit.organization?.restaurantDisplayName ||
          visit.organization?.name ||
          "Restaurante",
        headerImageData: visit.organization?.restaurantHeaderImageData ?? null,
        useHeaderImage: visit.organization?.restaurantUseHeaderImage ?? false,
      },
      table: visit.table,
      occupiesTable: visit.occupiesTable,
      deliveryPhone: visit.deliveryPhone,
      deliveryAddress: visit.deliveryAddress,
      paymentStatus: visit.paymentStatus,
      paymentConfirmedAt: visit.paymentConfirmedAt,
      deliveryHandedOffAt: visit.deliveryHandedOffAt,
      responsibleStaff: visit.responsibleStaff,
      orders: publicOrders,
      items,
      invoiceRequestStatus: visit.invoiceRequestStatus,
      promotions,
      correction: {
        orderId: latestOrder?.id ?? null,
        deadline: correctionDeadline,
        minutes: correctionMinutes,
        canCorrect: correctionBlockedReason === null,
        blockedReason: correctionBlockedReason,
        canRequestHelp:
          Boolean(latestOrder) &&
          visit.status === RestaurantVisitStatus.OPEN &&
          visit.occupiesTable !== false &&
          correctionBlockedReason !== null,
        requestedAt: latestOrder?.correctionRequestedAt ?? null,
        items:
          latestOrder?.items
            .filter(
              (item) =>
                item.status !== RestaurantItemStatus.CANCELLED &&
                !item.cancelledByGuestCorrection,
            )
            .map((item) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              fulfillment: item.fulfillment,
            })) ?? [],
        menu: correctionMenu,
      },
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

  async guestReceipt(accessCode: string) {
    const account = await this.guestOrder(accessCode);
    return {
      receiptNumber: account.receiptNumber ?? account.id,
      restaurant: account.restaurant,
      table: account.table.name,
      openedAt: account.createdAt,
      closedAt: account.closedAt,
      status: account.status,
      paymentStatus: account.paymentStatus,
      deliveryAddress: account.deliveryAddress,
      items: account.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        total: item.price * item.quantity,
        status: item.status,
      })),
      billing: account.billing,
    };
  }

  async joinLoyalty(accessCode: string, dto: JoinLoyaltyDto) {
    const nickname = dto.nickname.trim();
    const email = dto.email.trim().toLowerCase();
    if (!nickname) throw new BadRequestException("Name or nickname required");
    const visit = await this.prisma.restaurantVisit.findUnique({
      where: { accessCode },
      select: { id: true, organizationId: true, status: true },
    });
    if (!visit) throw new NotFoundException("Account not found");
    if (visit.status !== RestaurantVisitStatus.CLOSED) {
      throw new ConflictException(
        "Loyalty enrollment is available after checkout",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.restaurantLoyaltyMember.upsert({
        where: { email },
        create: {
          email,
          nickname,
          marketingOptIn: dto.marketingOptIn,
          marketingConsentAt: dto.marketingOptIn ? new Date() : null,
        },
        update: {
          nickname,
          marketingOptIn: dto.marketingOptIn,
          marketingConsentAt: dto.marketingOptIn ? new Date() : null,
          deletedAt: null,
        },
      });
      await tx.restaurantLoyaltyActivity.upsert({
        where: {
          memberId_visitId_type: {
            memberId: member.id,
            visitId: visit.id,
            type: RestaurantLoyaltyActivityType.VISIT_COMPLETED,
          },
        },
        create: {
          memberId: member.id,
          organizationId: visit.organizationId,
          visitId: visit.id,
          type: RestaurantLoyaltyActivityType.VISIT_COMPLETED,
          points: 10,
        },
        update: {},
      });
      const visits = await tx.restaurantLoyaltyActivity.count({
        where: {
          memberId: member.id,
          type: RestaurantLoyaltyActivityType.VISIT_COMPLETED,
        },
      });
      const vipTier = visits >= 15 ? "GOLD" : visits >= 5 ? "VIP" : "MEMBER";
      const points = visits * 10;
      const updated = await tx.restaurantLoyaltyMember.update({
        where: { id: member.id },
        data: { vipTier, assettrackPoints: points },
        select: {
          nickname: true,
          email: true,
          marketingOptIn: true,
          vipTier: true,
          assettrackPoints: true,
        },
      });
      const localVisits = await tx.restaurantLoyaltyActivity.count({
        where: {
          memberId: member.id,
          organizationId: visit.organizationId,
          type: RestaurantLoyaltyActivityType.VISIT_COMPLETED,
        },
      });
      const rewardRows = await tx.restaurantRewardProgram.findMany({
        where: {
          active: true,
          OR: [
            { organizationId: visit.organizationId },
            {
              sponsor: RestaurantRewardSponsor.ASSETTRACK,
              organizationId: null,
            },
          ],
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
          ],
        },
        select: {
          id: true,
          name: true,
          description: true,
          pointsRequired: true,
          sponsor: true,
          rewardType: true,
          discountBps: true,
          maxDiscountAmount: true,
          menuItem: { select: { id: true, name: true } },
        },
        orderBy: { pointsRequired: "asc" },
      });
      const localPoints = localVisits * 10;
      const rewards = rewardRows.filter(
        (reward) =>
          reward.pointsRequired <=
          (reward.sponsor === RestaurantRewardSponsor.RESTAURANT
            ? localPoints
            : points),
      );
      return { ...updated, visits, localVisits, localPoints, rewards };
    });
  }

  async loyaltySummary(actor: RestaurantActor) {
    this.requireRestaurantAdmin(actor);
    const activities = await this.prisma.restaurantLoyaltyActivity.findMany({
      where: {
        organizationId: actor.organizationId,
        type: RestaurantLoyaltyActivityType.VISIT_COMPLETED,
      },
      select: {
        memberId: true,
        createdAt: true,
        member: { select: { nickname: true, vipTier: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const counts = new Map<
      string,
      { nickname: string; vipTier: string; visits: number }
    >();
    for (const activity of activities) {
      const current = counts.get(activity.memberId) ?? {
        nickname: activity.member.nickname,
        vipTier: activity.member.vipTier,
        visits: 0,
      };
      current.visits += 1;
      counts.set(activity.memberId, current);
    }
    return {
      enrolledCustomers: counts.size,
      completedVisits: activities.length,
      frequentCustomers: [...counts.values()]
        .filter((entry) => entry.visits > 1)
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 20),
    };
  }

  rewardPrograms(actor: RestaurantActor) {
    this.requireRestaurantAdmin(actor);
    const now = new Date();
    return this.prisma.restaurantRewardProgram.findMany({
      where: {
        active: true,
        OR: [
          { organizationId: actor.organizationId },
          { sponsor: RestaurantRewardSponsor.ASSETTRACK, organizationId: null },
        ],
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ sponsor: "asc" }, { pointsRequired: "asc" }],
    });
  }

  addRewardProgram(actor: RestaurantActor, dto: CreateRewardProgramDto) {
    this.requireRestaurantAdmin(actor);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException("Reward end must follow its start");
    }
    if (dto.rewardType === RestaurantRewardType.MENU_ITEM && !dto.menuItemId) {
      throw new BadRequestException("Select a menu item for this reward");
    }
    if (
      dto.rewardType === RestaurantRewardType.DISCOUNT_PERCENT &&
      !dto.discountBps
    ) {
      throw new BadRequestException("Select a discount percentage");
    }
    return this.prisma.restaurantRewardProgram.create({
      data: {
        organizationId: actor.organizationId,
        sponsor: RestaurantRewardSponsor.RESTAURANT,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        pointsRequired: dto.pointsRequired,
        rewardType: dto.rewardType ?? RestaurantRewardType.CUSTOM,
        menuItemId:
          dto.rewardType === RestaurantRewardType.MENU_ITEM
            ? dto.menuItemId
            : null,
        discountBps:
          dto.rewardType === RestaurantRewardType.DISCOUNT_PERCENT
            ? dto.discountBps
            : null,
        maxDiscountAmount:
          dto.rewardType === RestaurantRewardType.DISCOUNT_PERCENT
            ? (dto.maxDiscountAmount ?? null)
            : null,
        vipTier: dto.vipTier?.trim().toUpperCase() || null,
        startsAt,
        endsAt,
      },
    });
  }

  async staffOrderEntry(actor: RestaurantActor) {
    const role = this.effectiveRole(actor);
    if (role !== RestaurantStaffRole.BAR) {
      throw new ForbiddenException("Bar access required");
    }
    const availableStations = await this.availableStations(actor.organizationId);
    const stations = [
      ...(availableStations.has(RestaurantStaffRole.KITCHEN)
        ? [RestaurantStation.KITCHEN]
        : []),
      ...(availableStations.has(RestaurantStaffRole.BAR)
        ? [RestaurantStation.BAR]
        : []),
    ];
    const [tables, menu] = await Promise.all([
      this.prisma.restaurantTable.findMany({
        where: {
          organizationId: actor.organizationId,
          active: true,
          kind: {
            in: [RestaurantTableKind.DINING, RestaurantTableKind.BAR_SEAT],
          },
        },
        select: { id: true, name: true, kind: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.restaurantMenuItem.findMany({
        where: {
          organizationId: actor.organizationId,
          active: true,
          station: { in: stations },
        },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          station: true,
          productType: true,
        },
        orderBy: [{ productType: "asc" }, { name: "asc" }],
      }),
    ]);
    return { tables, menu };
  }

  async createStaffOrder(actor: RestaurantActor, dto: CreateStaffOrderDto) {
    const role = this.effectiveRole(actor);
    if (role !== RestaurantStaffRole.BAR) {
      throw new ForbiddenException("Bar access required");
    }
    if (
      actor.restaurantAvailability !== RestaurantStaffAvailability.AVAILABLE
    ) {
      throw new ForbiddenException("El bartender no está disponible");
    }
    if (dto.fulfillment === RestaurantFulfillment.DELIVERY) {
      throw new BadRequestException(
        "Use una mesa o posición para crear esta orden",
      );
    }
    const table = await this.prisma.restaurantTable.findFirst({
      where: {
        id: dto.tableId,
        organizationId: actor.organizationId,
        active: true,
      },
      select: { id: true, code: true },
    });
    if (!table) throw new NotFoundException("Mesa o posición no encontrada");
    const existingVisit = await this.prisma.restaurantVisit.findFirst({
      where: {
        organizationId: actor.organizationId,
        tableId: table.id,
        responsibleStaffId: actor.id,
        status: RestaurantVisitStatus.OPEN,
        occupiesTable: true,
      },
      select: { accessCode: true },
      orderBy: { openedAt: "desc" },
    });
    const { tableId: _tableId, ...orderDto } = dto;
    void _tableId;
    return this.placeOrder(
      table.code,
      { ...orderDto, accountAccessCode: existingVisit?.accessCode },
      actor,
    );
  }

  async orders(actor: RestaurantActor) {
    const role = this.effectiveRole(actor);
    if (!role) throw new ForbiddenException("Restaurant role required");
    const openStatuses: RestaurantItemStatus[] = [
      RestaurantItemStatus.RECEIVED,
      RestaurantItemStatus.ACCEPTED,
      RestaurantItemStatus.PREPARING,
      RestaurantItemStatus.READY,
    ];
    const roleWhere: Prisma.RestaurantOrderWhereInput =
      role === RestaurantStaffRole.KITCHEN
        ? {
            items: {
              some: {
                status: { in: openStatuses },
                station: RestaurantStation.KITCHEN,
              },
            },
          }
        : role === RestaurantStaffRole.BAR
          ? {
              OR: [
                {
                  items: {
                    some: {
                      status: { in: openStatuses },
                      station: RestaurantStation.BAR,
                    },
                  },
                },
                {
                  visit: { responsibleStaffId: actor.id },
                  items: {
                    some: { status: { in: openStatuses } },
                  },
                },
              ],
            }
          : role === RestaurantStaffRole.WAITER
            ? {
                OR: [
                  { visit: { responsibleStaffId: actor.id } },
                  {
                    visit: { responsibleStaffId: null },
                    table: { waiterId: actor.id },
                  },
                ],
              }
            : {};
    const orders = await this.prisma.restaurantOrder.findMany({
      where: {
        organizationId: actor.organizationId,
        ...roleWhere,
        AND: [
          {
            OR: [
              { visitId: null },
              {
                visit: {
                  paymentStatus: {
                    in: [
                      RestaurantPaymentStatus.NOT_REQUIRED,
                      RestaurantPaymentStatus.CONFIRMED,
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      include: {
        items: {
          where: {
            status: { in: openStatuses },
            ...(role === RestaurantStaffRole.KITCHEN
              ? { station: RestaurantStation.KITCHEN }
              : {}),
          },
          include: {
            events: {
              where: { note: { contains: "corrección" } },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
        table: { select: { id: true, name: true, waiterId: true } },
        visit: {
          select: {
            id: true,
            status: true,
            responsibleStaffId: true,
            paymentStatus: true,
            occupiesTable: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const evaluated = orders
      .map((order) => {
        const isResponsible =
          order.visit?.responsibleStaffId === actor.id ||
          (!order.visit?.responsibleStaffId &&
            order.table.waiterId === actor.id);
        const visibleItems = order.items
          .filter((item) => {
            if (role === RestaurantStaffRole.KITCHEN) {
              return item.station === RestaurantStation.KITCHEN;
            }
            if (role === RestaurantStaffRole.BAR) {
              return (
                item.station === RestaurantStation.BAR ||
                (isResponsible && openStatuses.includes(item.status))
              );
            }
            return true;
          })
          .map((item) => ({
            ...item,
            serviceAction:
              isResponsible && openStatuses.includes(item.status),
          }));
        return {
          ...order,
          items: visibleItems,
          correctionSource:
            visibleItems
              .flatMap((item) => item.events ?? [])
              .find((event) => event.note?.includes("corrección"))?.actorId
              ? "EMPLOYEE"
              : order.correctionCount > 0
                ? "CUSTOMER"
                : null,
          isResponsible,
          isDelayed:
            order.thresholdMinutes !== null &&
            Date.now() - order.createdAt.getTime() >
              order.thresholdMinutes * 60_000 &&
            visibleItems.length > 0,
        };
      })
      .filter((order) => order.items.length > 0);
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
      role !== RestaurantStaffRole.WAITER &&
      role !== RestaurantStaffRole.BAR
    ) {
      throw new ForbiddenException("Waiter access required");
    }
    await this.prisma.$transaction((tx) =>
      this.recoverOpenAccountAssignments(tx, actor.organizationId),
    );
    const visits = await this.prisma.restaurantVisit.findMany({
      where: {
        organizationId: actor.organizationId,
        status: RestaurantVisitStatus.OPEN,
        ...(role === RestaurantStaffRole.WAITER
          ? {
              OR: [
                { responsibleStaffId: actor.id },
                { responsibleStaffId: null, table: { waiterId: actor.id } },
              ],
            }
          : role === RestaurantStaffRole.BAR
            ? { responsibleStaffId: actor.id }
            : {}),
      },
      include: {
        responsibleStaff: {
          select: { id: true, name: true, restaurantRole: true },
        },
        table: {
          select: {
            id: true,
            name: true,
            waiterId: true,
            serviceChargeEnabled: true,
            kind: true,
          },
        },
        orders: {
          orderBy: { createdAt: "asc" },
          include: {
            items: {
              include: { events: { orderBy: { createdAt: "asc" } } },
            },
          },
        },
      },
      orderBy: { openedAt: "desc" },
    });
    const [destinationRows, correctionMenuRows] = await Promise.all([
      this.prisma.restaurantTable.findMany({
        where: { organizationId: actor.organizationId, active: true },
        select: {
          id: true,
          name: true,
          kind: true,
          serviceChargeEnabled: true,
          _count: {
            select: {
              visits: {
                where: {
                  status: RestaurantVisitStatus.OPEN,
                  occupiesTable: true,
                },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.restaurantMenuItem.findMany({
        where: { organizationId: actor.organizationId, active: true },
        select: {
          id: true,
          name: true,
          price: true,
          station: true,
        },
        orderBy: [{ productType: "asc" }, { name: "asc" }],
      }),
    ]);
    const destinations = destinationRows ?? [];
    const correctionMenu = correctionMenuRows ?? [];
    return visits.map((visit) => {
      const items = visit.orders.flatMap((order) =>
        order.items
          .filter((item) => item.status !== RestaurantItemStatus.CANCELLED)
          .map((item) => ({
          ...item,
          orderId: order.id,
          orderCreatedAt: order.createdAt,
          events: undefined,
        })),
      );
      const latestOrder = visit.orders.at(-1);
      const latestActiveItems =
        latestOrder?.items.filter(
          (item) => item.status !== RestaurantItemStatus.CANCELLED,
        ) ?? [];
      const lastCorrectionEvent = latestOrder?.items
        .flatMap((item) => item.events ?? [])
        .filter((event) => event.note?.includes("corrección"))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
      const editableStatuses: RestaurantItemStatus[] = [
        RestaurantItemStatus.RECEIVED,
        RestaurantItemStatus.ACCEPTED,
      ];
      const correctionRequest = visit.orders
        .filter((order) => order.correctionRequestedAt)
        .sort(
          (left, right) =>
            (right.correctionRequestedAt?.getTime() ?? 0) -
            (left.correctionRequestedAt?.getTime() ?? 0),
        )[0];
      return {
        id: visit.id,
        openedAt: visit.openedAt,
        occupiesTable: visit.occupiesTable,
        deliveryPhone: visit.deliveryPhone,
        deliveryAddress: visit.deliveryAddress,
        paymentStatus: visit.paymentStatus,
        paymentConfirmedAt: visit.paymentConfirmedAt,
        deliveryHandedOffAt: visit.deliveryHandedOffAt,
        table: visit.table,
        responsibleStaff: visit.responsibleStaff,
        correctionRequest: correctionRequest
          ? {
              orderId: correctionRequest.id,
              requestedAt: correctionRequest.correctionRequestedAt,
              note: correctionRequest.correctionRequestNote,
            }
          : null,
        staffCorrection: latestOrder
          ? {
              orderId: latestOrder.id,
              canCorrect:
                latestActiveItems.length > 0 &&
                latestActiveItems.every((item) =>
                  editableStatuses.includes(item.status),
                ),
              blockedReason:
                latestActiveItems.length === 0
                  ? "El pedido no tiene productos activos."
                  : latestActiveItems.some(
                        (item) => !editableStatuses.includes(item.status),
                      )
                    ? "La preparación ya comenzó; solicite apoyo administrativo para cualquier excepción."
                    : null,
              correctionCount: latestOrder.correctionCount,
              lastCorrectedAt: lastCorrectionEvent?.createdAt ?? null,
              items: latestActiveItems.map((item) => ({
                menuItemId: item.menuItemId,
                name: item.name,
                quantity: item.quantity,
                fulfillment: item.fulfillment,
              })),
              menu: correctionMenu,
            }
          : null,
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
        canClose:
          visit.occupiesTable !== false &&
          items.every(
            (item) =>
              item.status === RestaurantItemStatus.DELIVERED ||
              item.status === RestaurantItemStatus.CANCELLED,
          ),
        canHandoffDelivery:
          visit.occupiesTable === false &&
          visit.paymentStatus === RestaurantPaymentStatus.CONFIRMED &&
          items.every(
            (item) =>
              item.status === RestaurantItemStatus.DELIVERED ||
              item.status === RestaurantItemStatus.CANCELLED,
          ),
        transferDestinations:
          visit.occupiesTable !== false
            ? destinations
                .filter((table) => table.id !== visit.tableId)
                .map((table) => ({
                  ...table,
                  activeAccountCount: table._count.visits,
                  _count: undefined,
                }))
            : [],
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
          order: {
            select: {
              table: { select: { waiterId: true } },
              visit: { select: { responsibleStaffId: true, status: true, paymentStatus: true } },
            },
          },
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
      const isAssignedResponsible =
        (role === RestaurantStaffRole.WAITER ||
          role === RestaurantStaffRole.BAR) &&
        (item.order.visit?.responsibleStaffId === actor.id ||
          (!item.order.visit?.responsibleStaffId &&
            item.order.table.waiterId === actor.id));
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
        !(
          (isStation && stationTarget) ||
          (isAssignedResponsible && waiterTarget)
        )
      ) {
        throw new ForbiddenException(
          "Status change is not allowed for this role",
        );
      }
      if (!transitions[item.status].includes(dto.status))
        throw new BadRequestException("Invalid status change");
      if (dto.status === RestaurantItemStatus.DELIVERED && item.order.visit) {
        if (item.order.visit.status !== RestaurantVisitStatus.OPEN) {
          throw new ConflictException("La cuenta ya está cerrada");
        }
        if (
          item.order.visit.paymentStatus === RestaurantPaymentStatus.PENDING ||
          item.order.visit.paymentStatus === RestaurantPaymentStatus.REJECTED
        ) {
          throw new ConflictException("Confirme el pago antes de entregar el pedido");
        }
      }
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

  async acknowledgeCorrectionRequest(actor: RestaurantActor, id: string) {
    const order = await this.prisma.restaurantOrder.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: {
        id: true,
        visit: { select: { responsibleStaffId: true } },
        table: { select: { waiterId: true } },
      },
    });
    if (!order) throw new NotFoundException("Pedido no encontrado");
    const role = this.effectiveRole(actor);
    const isAdmin = role === RestaurantStaffRole.RESTAURANT_ADMIN;
    const isResponsible =
      (role === RestaurantStaffRole.WAITER ||
        role === RestaurantStaffRole.BAR) &&
      (order.visit?.responsibleStaffId === actor.id ||
        (!order.visit?.responsibleStaffId &&
          order.table.waiterId === actor.id));
    if (!isAdmin && !isResponsible) {
      throw new ForbiddenException(
        "Solo el responsable de la cuenta puede atender esta solicitud",
      );
    }
    return this.prisma.restaurantOrder.update({
      where: { id },
      data: {
        correctionRequestedAt: null,
        correctionRequestNote: null,
      },
      select: { id: true },
    });
  }

  async handoffItem(actor: RestaurantActor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.restaurantOrderItem.findFirst({
        where: { id, order: { organizationId: actor.organizationId } },
        include: {
          order: {
            select: {
              table: { select: { waiterId: true } },
              visit: { select: { responsibleStaffId: true } },
            },
          },
        },
      });
      if (!item) throw new NotFoundException("Order item not found");
      if (item.status !== RestaurantItemStatus.READY) {
        throw new ConflictException("Only ready items can be received");
      }
      if (item.handedOffAt) return item;
      const role = this.effectiveRole(actor);
      const isAdmin = role === RestaurantStaffRole.RESTAURANT_ADMIN;
      const isResponsible =
        (role === RestaurantStaffRole.WAITER ||
          role === RestaurantStaffRole.BAR) &&
        (item.order.visit?.responsibleStaffId === actor.id ||
          (!item.order.visit?.responsibleStaffId &&
            item.order.table.waiterId === actor.id));
      if (!isAdmin && !isResponsible) {
        throw new ForbiddenException(
          "Only the staff member responsible for this account can receive it",
        );
      }
      if (
        !isAdmin &&
        actor.restaurantAvailability !== RestaurantStaffAvailability.AVAILABLE
      ) {
        throw new ForbiddenException("Staff member is not available for work");
      }
      const handedOffAt = new Date();
      const result = await tx.restaurantOrderItem.updateMany({
        where: { id, status: RestaurantItemStatus.READY, handedOffAt: null },
        data: { handedOffAt },
      });
      if (!result.count) {
        throw new ConflictException("Item was received by someone else");
      }
      await tx.restaurantItemEvent.create({
        data: {
          itemId: id,
          actorId: actor.id,
          status: RestaurantItemStatus.READY,
          note: "HANDOFF_CONFIRMED",
        },
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
      if (
        item.fulfillment === RestaurantFulfillment.DELIVERY ||
        dto.fulfillment === RestaurantFulfillment.DELIVERY
      ) {
        throw new BadRequestException(
          "La modalidad a domicilio se gestiona para la cuenta completa",
        );
      }
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
