import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import {
  RestaurantFulfillment,
  RestaurantItemStatus,
  RestaurantVisitStatus,
} from "../generated/prisma/enums";
import {
  getUtcDateRangeForLocalDate,
  normalizeTimezone,
} from "../common/timezone-date-range";

type DatabaseClient = Prisma.TransactionClient | PrismaService;

type ClosedVisit = {
  id: string;
  organizationId: string;
  closedAt: Date | null;
  receiptNumber: string | null;
  taxRateBps: number;
  taxIncluded: boolean;
  serviceRateBps: number;
  serviceChargeEnabled: boolean;
  closedAnalyticsConsolidatedAt: Date | null;
  orders: Array<{
    promotionCredit: number;
    items: Array<{
      name: string;
      price: number;
      quantity: number;
      status: string;
    }>;
  }>;
};

@Injectable()
export class RestaurantDataLifecycleService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RestaurantDataLifecycleService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const start = setTimeout(() => {
      void this.runMaintenance().catch((error: unknown) =>
        this.logger.error("Restaurant data maintenance failed", error),
      );
    }, 5_000);
    start.unref();
    this.timer = setInterval(
      () => {
        void this.runMaintenance().catch((error: unknown) =>
          this.logger.error("Restaurant data maintenance failed", error),
        );
      },
      60 * 60 * 1_000,
    );
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  receiptNumber(visitId: string, closedAt: Date) {
    const date = closedAt.toISOString().slice(0, 10).replaceAll("-", "");
    const suffix = visitId.replaceAll("-", "").slice(0, 16).toUpperCase();
    return `AT-${date}-${suffix}`;
  }

  private async organizationTimezone(
    organizationId: string,
    client: DatabaseClient = this.prisma,
  ) {
    const location = await client.organizationLocation.findFirst({
      where: { organizationId, active: true },
      select: { timezone: true },
      orderBy: { createdAt: "asc" },
    });
    return normalizeTimezone(location?.timezone ?? "UTC");
  }

  private localDate(date: Date, timezone: string) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  private billing(visit: ClosedVisit) {
    const items = visit.orders.flatMap((order) => order.items);
    const grossSubtotal = items
      .filter((item) => item.status !== RestaurantItemStatus.CANCELLED)
      .reduce((sum, item) => sum + item.price * item.quantity, 0);
    const promotionCredit = Math.min(
      grossSubtotal,
      visit.orders.reduce(
        (sum, order) => sum + Math.max(0, order.promotionCredit ?? 0),
        0,
      ),
    );
    const subtotal = grossSubtotal - promotionCredit;
    const tax =
      visit.taxRateBps === 0
        ? 0
        : visit.taxIncluded
          ? Math.round(
              subtotal - (subtotal * 10_000) / (10_000 + visit.taxRateBps),
            )
          : Math.round((subtotal * visit.taxRateBps) / 10_000);
    const service = visit.serviceChargeEnabled
      ? Math.round((subtotal * visit.serviceRateBps) / 10_000)
      : 0;
    return {
      grossSubtotal,
      promotionCredit,
      subtotal,
      tax,
      service,
      total: subtotal + service + (visit.taxIncluded ? 0 : tax),
      items,
    };
  }

  private dailyIncrement(
    client: DatabaseClient,
    organizationId: string,
    date: string,
    fields: Record<string, number>,
  ) {
    const create = { organizationId, date, ...fields };
    const update = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, { increment: value }]),
    );
    return client.restaurantAnalyticsDaily.upsert({
      where: { organizationId_date: { organizationId, date } },
      create,
      update,
    });
  }

  private async consolidateQrAccess(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.restaurantQrAccess.updateMany({
        where: { id, analyticsConsolidatedAt: null },
        data: { analyticsConsolidatedAt: new Date() },
      });
      if (!claim.count) return;
      const access = await tx.restaurantQrAccess.findUnique({ where: { id } });
      if (!access) return;
      const timezone = await this.organizationTimezone(
        access.organizationId,
        tx,
      );
      const date = this.localDate(access.createdAt, timezone);
      const range = getUtcDateRangeForLocalDate(date, timezone);
      const priorSessionAccesses = await tx.restaurantQrAccess.count({
        where: {
          organizationId: access.organizationId,
          sessionKey: access.sessionKey,
          id: { not: access.id },
          createdAt: { gte: range.start, lt: access.createdAt },
          analyticsConsolidatedAt: { not: null },
        },
      });
      await this.dailyIncrement(tx, access.organizationId, date, {
        qrAccesses: 1,
        uniqueQrSessions: priorSessionAccesses === 0 ? 1 : 0,
      });
    });
  }

  private async consolidateVisitOpened(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.restaurantVisit.updateMany({
        where: { id, openedAnalyticsConsolidatedAt: null },
        data: { openedAnalyticsConsolidatedAt: new Date() },
      });
      if (!claim.count) return;
      const visit = await tx.restaurantVisit.findUnique({ where: { id } });
      if (!visit) return;
      const timezone = await this.organizationTimezone(
        visit.organizationId,
        tx,
      );
      const date = this.localDate(visit.openedAt, timezone);
      await this.dailyIncrement(tx, visit.organizationId, date, {
        visitsOpened: 1,
      });
    });
  }

  private async consolidateOrder(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.restaurantOrder.updateMany({
        where: { id, analyticsConsolidatedAt: null },
        data: { analyticsConsolidatedAt: new Date() },
      });
      if (!claim.count) return;
      const order = await tx.restaurantOrder.findUnique({ where: { id } });
      if (!order) return;
      const timezone = await this.organizationTimezone(
        order.organizationId,
        tx,
      );
      const date = this.localDate(order.createdAt, timezone);
      await this.dailyIncrement(tx, order.organizationId, date, {
        orders: 1,
        dineInOrders:
          order.fulfillment === RestaurantFulfillment.DINE_IN ? 1 : 0,
        takeoutOrders:
          order.fulfillment === RestaurantFulfillment.TAKEOUT ? 1 : 0,
        deliveryOrders:
          order.fulfillment === RestaurantFulfillment.DELIVERY ? 1 : 0,
      });
    });
  }

  private async consolidateVisitClosed(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.restaurantVisit.updateMany({
        where: {
          id,
          status: RestaurantVisitStatus.CLOSED,
          closedAt: { not: null },
          closedAnalyticsConsolidatedAt: null,
        },
        data: { closedAnalyticsConsolidatedAt: new Date() },
      });
      if (!claim.count) return;
      const visit = await tx.restaurantVisit.findUnique({
        where: { id },
        include: {
          orders: {
            select: {
              promotionCredit: true,
              items: {
                select: {
                  name: true,
                  price: true,
                  quantity: true,
                  status: true,
                },
              },
            },
          },
        },
      });
      if (
        !visit ||
        visit.status !== RestaurantVisitStatus.CLOSED ||
        !visit.closedAt ||
        !visit.closedAnalyticsConsolidatedAt
      ) {
        return;
      }
      const timezone = await this.organizationTimezone(
        visit.organizationId,
        tx,
      );
      const date = this.localDate(visit.closedAt, timezone);
      const billing = this.billing(visit);
      const itemsSold = billing.items
        .filter((item) => item.status !== RestaurantItemStatus.CANCELLED)
        .reduce((sum, item) => sum + item.quantity, 0);
      const itemsCancelled = billing.items
        .filter((item) => item.status === RestaurantItemStatus.CANCELLED)
        .reduce((sum, item) => sum + item.quantity, 0);
      await this.dailyIncrement(tx, visit.organizationId, date, {
        visitsClosed: 1,
        grossSubtotal: billing.grossSubtotal,
        promotionCredit: billing.promotionCredit,
        subtotal: billing.subtotal,
        tax: billing.tax,
        service: billing.service,
        total: billing.total,
        itemsSold,
        itemsCancelled,
      });
      const quantities = new Map<string, number>();
      for (const item of billing.items) {
        if (item.status === RestaurantItemStatus.CANCELLED) continue;
        quantities.set(
          item.name,
          (quantities.get(item.name) ?? 0) + item.quantity,
        );
      }
      for (const [productName, quantity] of quantities) {
        await tx.restaurantAnalyticsProductDaily.upsert({
          where: {
            organizationId_date_productName: {
              organizationId: visit.organizationId,
              date,
              productName,
            },
          },
          create: {
            organizationId: visit.organizationId,
            date,
            productName,
            quantity,
          },
          update: { quantity: { increment: quantity } },
        });
      }
      await tx.restaurantVisit.update({
        where: { id: visit.id },
        data: {
          receiptNumber:
            visit.receiptNumber ?? this.receiptNumber(visit.id, visit.closedAt),
        },
      });
    });
  }

  async consolidatePending(organizationId?: string) {
    const where = organizationId ? { organizationId } : {};
    let consolidated = 0;
    for (let pass = 0; pass < 100; pass += 1) {
      const [qrAccesses, visitsOpened, orders, visitsClosed] =
        await Promise.all([
          this.prisma.restaurantQrAccess.findMany({
            where: { ...where, analyticsConsolidatedAt: null },
            select: { id: true },
            orderBy: { createdAt: "asc" },
            take: 100,
          }),
          this.prisma.restaurantVisit.findMany({
            where: { ...where, openedAnalyticsConsolidatedAt: null },
            select: { id: true },
            orderBy: { openedAt: "asc" },
            take: 100,
          }),
          this.prisma.restaurantOrder.findMany({
            where: { ...where, analyticsConsolidatedAt: null },
            select: { id: true },
            orderBy: { createdAt: "asc" },
            take: 100,
          }),
          this.prisma.restaurantVisit.findMany({
            where: {
              ...where,
              status: RestaurantVisitStatus.CLOSED,
              closedAt: { not: null },
              closedAnalyticsConsolidatedAt: null,
            },
            select: { id: true },
            orderBy: { closedAt: "asc" },
            take: 100,
          }),
        ]);
      if (
        !qrAccesses.length &&
        !visitsOpened.length &&
        !orders.length &&
        !visitsClosed.length
      ) {
        break;
      }
      for (const entry of qrAccesses) await this.consolidateQrAccess(entry.id);
      for (const entry of visitsOpened)
        await this.consolidateVisitOpened(entry.id);
      for (const entry of orders) await this.consolidateOrder(entry.id);
      for (const entry of visitsClosed)
        await this.consolidateVisitClosed(entry.id);
      consolidated +=
        qrAccesses.length +
        visitsOpened.length +
        orders.length +
        visitsClosed.length;
    }
    return consolidated;
  }

  async runMaintenance(organizationId?: string) {
    const organizations = await this.prisma.organization.findMany({
      where: organizationId ? { id: organizationId } : undefined,
      select: { id: true, restaurantRetentionDays: true },
    });
    let consolidated = 0;
    let deletedQrAccesses = 0;
    let deletedVisits = 0;
    let deletedOrphanOrders = 0;
    for (const organization of organizations) {
      consolidated += await this.consolidatePending(organization.id);
      const cutoff = new Date(
        Date.now() - organization.restaurantRetentionDays * 86_400_000,
      );
      const qrResult = await this.prisma.restaurantQrAccess.deleteMany({
        where: {
          organizationId: organization.id,
          createdAt: { lt: cutoff },
          analyticsConsolidatedAt: { not: null },
        },
      });
      deletedQrAccesses += qrResult.count;
      let organizationDeletedVisits = 0;
      const expiredVisits = await this.prisma.restaurantVisit.findMany({
        where: {
          organizationId: organization.id,
          status: RestaurantVisitStatus.CLOSED,
          closedAt: { lt: cutoff },
          openedAnalyticsConsolidatedAt: { not: null },
          closedAnalyticsConsolidatedAt: { not: null },
          orders: { every: { analyticsConsolidatedAt: { not: null } } },
        },
        select: { id: true },
      });
      if (expiredVisits.length) {
        const result = await this.prisma.restaurantVisit.deleteMany({
          where: { id: { in: expiredVisits.map((visit) => visit.id) } },
        });
        deletedVisits += result.count;
        organizationDeletedVisits = result.count;
      }
      const orphanResult = await this.prisma.restaurantOrder.deleteMany({
        where: {
          organizationId: organization.id,
          visitId: null,
          createdAt: { lt: cutoff },
          analyticsConsolidatedAt: { not: null },
        },
      });
      deletedOrphanOrders += orphanResult.count;
      if (
        qrResult.count > 0 ||
        organizationDeletedVisits > 0 ||
        orphanResult.count > 0
      ) {
        await this.prisma.platformAdminEvent.create({
          data: {
            actorId: "SYSTEM",
            action: "RESTAURANT_RETENTION_PURGE",
            organizationId: organization.id,
            metadata: {
              retentionDays: organization.restaurantRetentionDays,
              cutoff: cutoff.toISOString(),
              deletedQrAccesses: qrResult.count,
              deletedVisits: organizationDeletedVisits,
              deletedOrphanOrders: orphanResult.count,
            },
          },
        });
      }
    }
    return {
      organizations: organizations.length,
      consolidated,
      deletedQrAccesses,
      deletedVisits,
      deletedOrphanOrders,
      completedAt: new Date(),
    };
  }
}
