import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  RestaurantCashSessionStatus,
  RestaurantItemStatus,
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  RestaurantVisitStatus,
  UserRole,
} from "../generated/prisma/enums";
import {
  getUtcDateRangeForLocalDate,
  normalizeTimezone,
} from "../common/timezone-date-range";
import type { RestaurantActor } from "./restaurant.service";
import type { CloseCashSessionDto } from "./dto/restaurant.dto";

@Injectable()
export class RestaurantCashService {
  constructor(private readonly prisma: PrismaService) {}

  private effectiveRole(actor: RestaurantActor) {
    if (actor.role === UserRole.OWNER || actor.role === UserRole.ADMIN) {
      return RestaurantStaffRole.RESTAURANT_ADMIN;
    }
    return actor.restaurantRole;
  }

  private isAdministrator(actor: RestaurantActor) {
    return this.effectiveRole(actor) === RestaurantStaffRole.RESTAURANT_ADMIN;
  }

  private async timezone(organizationId: string) {
    const location = await this.prisma.organizationLocation.findFirst({
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
      subtotal,
      tax,
      service,
      total: subtotal + service + (settings.taxIncluded ? 0 : tax),
    };
  }

  private async accountsBetween(
    organizationId: string,
    start: Date,
    end: Date,
    responsibleStaffId?: string,
  ) {
    const visits = await this.prisma.restaurantVisit.findMany({
      where: {
        organizationId,
        status: RestaurantVisitStatus.CLOSED,
        closedAt: { gte: start, lt: end },
        ...(responsibleStaffId ? { responsibleStaffId } : {}),
      },
      include: {
        table: { select: { name: true, kind: true } },
        orders: {
          orderBy: { createdAt: "asc" },
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
      orderBy: { closedAt: "asc" },
    });

    return visits.map((visit) => {
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
      return {
        id: visit.id,
        receiptNumber: visit.receiptNumber,
        table: visit.table,
        closedAt: visit.closedAt,
        billing,
      };
    });
  }

  private summarize(
    accounts: Array<{ billing: { total: number } }>,
  ) {
    return {
      accountCount: accounts.length,
      salesTotal: accounts.reduce(
        (sum, account) => sum + account.billing.total,
        0,
      ),
    };
  }

  private async currentUser(actor: RestaurantActor) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: actor.id,
        organizationId: actor.organizationId,
        active: true,
      },
      select: {
        id: true,
        name: true,
        restaurantRole: true,
        restaurantAvailability: true,
        restaurantCashAuthorized: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  private canAssume(
    actor: RestaurantActor,
    user: { restaurantCashAuthorized: boolean },
  ) {
    const role = this.effectiveRole(actor);
    return (
      role === RestaurantStaffRole.RESTAURANT_ADMIN ||
      role === RestaurantStaffRole.CASHIER ||
      user.restaurantCashAuthorized
    );
  }

  private async defaultRegister(organizationId: string) {
    return this.prisma.restaurantCashRegister.upsert({
      where: {
        organizationId_name: {
          organizationId,
          name: "Caja principal",
        },
      },
      create: {
        organizationId,
        name: "Caja principal",
      },
      update: { active: true },
    });
  }

  async current(actor: RestaurantActor) {
    const user = await this.currentUser(actor);
    const canAccess = this.canAssume(actor, user);
    const register = await this.prisma.restaurantCashRegister.findFirst({
      where: {
        organizationId: actor.organizationId,
        active: true,
        name: "Caja principal",
      },
    });
    const session = register
      ? await this.prisma.restaurantCashSession.findUnique({
          where: { openGuard: register.id },
          include: {
            responsibleUser: {
              select: { id: true, name: true, restaurantRole: true },
            },
          },
        })
      : null;
    const timezone = await this.timezone(actor.organizationId);
    const businessDate = this.localDate(new Date(), timezone);
    const dayClose = register
      ? await this.prisma.restaurantCashDayClose.findUnique({
          where: {
            cashRegisterId_businessDate: {
              cashRegisterId: register.id,
              businessDate,
            },
          },
          include: {
            responsibleUser: {
              select: { id: true, name: true, restaurantRole: true },
            },
          },
        })
      : null;
    const currentSummary = session
      ? this.summarize(
          await this.accountsBetween(
            actor.organizationId,
            session.startedAt,
            new Date(),
          ),
        )
      : null;

    return {
      canAccess,
      businessDate,
      register: register
        ? { id: register.id, name: register.name }
        : { id: null, name: "Caja principal" },
      session,
      currentSummary,
      dayClose,
      currentUserIsResponsible:
        Boolean(session) && session?.responsibleUserId === actor.id,
    };
  }

  async updateAuthorization(
    actor: RestaurantActor,
    userId: string,
    authorized: boolean,
  ) {
    if (!this.isAdministrator(actor)) {
      throw new ForbiddenException("Restaurant administrator access required");
    }
    const target = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: actor.organizationId,
        active: true,
      },
      select: { id: true, restaurantRole: true },
    });
    if (!target) throw new NotFoundException("User not found");
    if (!authorized) {
      const activeSession = await this.prisma.restaurantCashSession.findFirst({
        where: {
          organizationId: actor.organizationId,
          responsibleUserId: userId,
          openGuard: { not: null },
        },
        select: { id: true },
      });
      if (activeSession) {
        throw new ConflictException(
          "No puede retirar la autorizaciÃ³n mientras la persona tenga una caja abierta",
        );
      }
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { restaurantCashAuthorized: authorized },
      select: {
        id: true,
        name: true,
        restaurantRole: true,
        restaurantCashAuthorized: true,
      },
    });
  }

  async assume(actor: RestaurantActor) {
    const user = await this.currentUser(actor);
    if (!this.canAssume(actor, user)) {
      throw new ForbiddenException(
        "Este usuario no estÃ¡ autorizado para asumir la caja",
      );
    }
    if (
      !this.isAdministrator(actor) &&
      user.restaurantAvailability !== RestaurantStaffAvailability.AVAILABLE
    ) {
      throw new ConflictException(
        "El empleado debe estar disponible para asumir la caja",
      );
    }
    const register = await this.defaultRegister(actor.organizationId);
    const timezone = await this.timezone(actor.organizationId);
    const businessDate = this.localDate(new Date(), timezone);
    const dayClose = await this.prisma.restaurantCashDayClose.findUnique({
      where: {
        cashRegisterId_businessDate: {
          cashRegisterId: register.id,
          businessDate,
        },
      },
      select: { id: true },
    });
    if (dayClose) {
      throw new ConflictException(
        "El cierre general del dÃ­a ya fue registrado para esta caja",
      );
    }
    const current = await this.prisma.restaurantCashSession.findUnique({
      where: { openGuard: register.id },
      include: {
        responsibleUser: { select: { id: true, name: true } },
      },
    });
    if (current) {
      if (current.responsibleUserId === actor.id) return current;
      throw new ConflictException(
        `La caja ya estÃ¡ bajo responsabilidad de ${current.responsibleUser.name}`,
      );
    }
    return this.prisma.restaurantCashSession.create({
      data: {
        organizationId: actor.organizationId,
        cashRegisterId: register.id,
        responsibleUserId: actor.id,
        openGuard: register.id,
      },
      include: {
        responsibleUser: {
          select: { id: true, name: true, restaurantRole: true },
        },
      },
    });
  }

  async close(
    actor: RestaurantActor,
    sessionId: string,
    dto: CloseCashSessionDto,
  ) {
    const session = await this.prisma.restaurantCashSession.findFirst({
      where: {
        id: sessionId,
        organizationId: actor.organizationId,
        openGuard: { not: null },
      },
      include: {
        cashRegister: true,
        responsibleUser: {
          select: { id: true, name: true, restaurantRole: true },
        },
      },
    });
    if (!session) throw new NotFoundException("Open cash session not found");

    const isResponsible = session.responsibleUserId === actor.id;
    const isAdmin = this.isAdministrator(actor);
    if (!isResponsible && !isAdmin) {
      throw new ForbiddenException(
        "Only the current cash responsible person can close this session",
      );
    }
    if (dto.finalDailyClose && !isResponsible) {
      throw new ForbiddenException(
        "El cierre general debe registrarlo la persona que tiene la caja a su nombre",
      );
    }

    const now = new Date();
    const sessionAccounts = await this.accountsBetween(
      actor.organizationId,
      session.startedAt,
      now,
    );
    const sessionSummary = this.summarize(sessionAccounts);
    const closeNote = dto.note?.trim() || null;

    if (!dto.finalDailyClose) {
      return this.prisma.restaurantCashSession.update({
        where: { id: session.id },
        data: {
          endedAt: now,
          status: RestaurantCashSessionStatus.CLOSED_HANDOFF,
          openGuard: null,
          accountCount: sessionSummary.accountCount,
          salesTotal: sessionSummary.salesTotal,
          closeNote:
            closeNote ??
            (isAdmin && !isResponsible
              ? `Liberada por administraciÃ³n (${actor.id})`
              : "Entrega de caja"),
        },
        include: {
          responsibleUser: {
            select: { id: true, name: true, restaurantRole: true },
          },
        },
      });
    }

    const timezone = await this.timezone(actor.organizationId);
    const businessDate = this.localDate(now, timezone);
    const { start, end } = getUtcDateRangeForLocalDate(
      businessDate,
      timezone,
    );
    const dayAccounts = await this.accountsBetween(
      actor.organizationId,
      start,
      end,
    );
    const daySummary = this.summarize(dayAccounts);
    const sessionCount =
      (await this.prisma.restaurantCashSession.count({
        where: {
          cashRegisterId: session.cashRegisterId,
          startedAt: { gte: start, lt: end },
        },
      })) || 1;

    const existingClose =
      await this.prisma.restaurantCashDayClose.findUnique({
        where: {
          cashRegisterId_businessDate: {
            cashRegisterId: session.cashRegisterId,
            businessDate,
          },
        },
      });
    if (existingClose) {
      throw new ConflictException(
        "El cierre general del dÃ­a ya fue registrado",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const closedSession = await tx.restaurantCashSession.update({
        where: { id: session.id },
        data: {
          endedAt: now,
          status: RestaurantCashSessionStatus.CLOSED_DAY,
          openGuard: null,
          accountCount: sessionSummary.accountCount,
          salesTotal: sessionSummary.salesTotal,
          closeNote,
        },
      });
      const dayClose = await tx.restaurantCashDayClose.create({
        data: {
          organizationId: actor.organizationId,
          cashRegisterId: session.cashRegisterId,
          businessDate,
          responsibleUserId: actor.id,
          accountCount: daySummary.accountCount,
          salesTotal: daySummary.salesTotal,
          sessionCount,
          note: closeNote,
        },
        include: {
          responsibleUser: {
            select: { id: true, name: true, restaurantRole: true },
          },
        },
      });
      return { closedSession, dayClose };
    });
  }

  async daily(actor: RestaurantActor, requestedDate?: string) {
    const user = await this.currentUser(actor);
    if (!this.canAssume(actor, user)) {
      throw new ForbiddenException("Cash register access required");
    }
    const timezone = await this.timezone(actor.organizationId);
    const businessDate =
      requestedDate ?? this.localDate(new Date(), timezone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      throw new BadRequestException("Use date in YYYY-MM-DD format");
    }
    const { start, end } = getUtcDateRangeForLocalDate(
      businessDate,
      timezone,
    );
    const register = await this.prisma.restaurantCashRegister.findFirst({
      where: {
        organizationId: actor.organizationId,
        active: true,
        name: "Caja principal",
      },
    });
    if (!register) {
      return {
        businessDate,
        timezone,
        register: { id: null, name: "Caja principal" },
        sessions: [],
        dayClose: null,
        daySummary: { accountCount: 0, salesTotal: 0 },
      };
    }

    const sessions = await this.prisma.restaurantCashSession.findMany({
      where: {
        cashRegisterId: register.id,
        startedAt: { lt: end },
        OR: [{ endedAt: null }, { endedAt: { gte: start } }],
      },
      include: {
        responsibleUser: {
          select: { id: true, name: true, restaurantRole: true },
        },
      },
      orderBy: { startedAt: "asc" },
    });

    const sessionRows = [];
    for (const session of sessions) {
      if (session.endedAt) {
        sessionRows.push(session);
        continue;
      }
      const currentSummary = this.summarize(
        await this.accountsBetween(
          actor.organizationId,
          session.startedAt,
          new Date(),
        ),
      );
      sessionRows.push({
        ...session,
        accountCount: currentSummary.accountCount,
        salesTotal: currentSummary.salesTotal,
      });
    }

    const dayClose =
      await this.prisma.restaurantCashDayClose.findUnique({
        where: {
          cashRegisterId_businessDate: {
            cashRegisterId: register.id,
            businessDate,
          },
        },
        include: {
          responsibleUser: {
            select: { id: true, name: true, restaurantRole: true },
          },
        },
      });
    const daySummary = this.summarize(
      await this.accountsBetween(actor.organizationId, start, end),
    );

    return {
      businessDate,
      timezone,
      register: { id: register.id, name: register.name },
      sessions: sessionRows,
      dayClose,
      daySummary,
    };
  }

  async employeeDaily(
    actor: RestaurantActor,
    requestedDate?: string,
    requestedUserId?: string,
  ) {
    const timezone = await this.timezone(actor.organizationId);
    const businessDate =
      requestedDate ?? this.localDate(new Date(), timezone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      throw new BadRequestException("Use date in YYYY-MM-DD format");
    }
    const targetUserId =
      requestedUserId && this.isAdministrator(actor)
        ? requestedUserId
        : actor.id;
    if (requestedUserId && requestedUserId !== actor.id && !this.isAdministrator(actor)) {
      throw new ForbiddenException("Administrator access required");
    }
    const target = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        organizationId: actor.organizationId,
      },
      select: {
        id: true,
        name: true,
        restaurantRole: true,
      },
    });
    if (!target) throw new NotFoundException("User not found");
    const { start, end } = getUtcDateRangeForLocalDate(
      businessDate,
      timezone,
    );
    const accounts = await this.accountsBetween(
      actor.organizationId,
      start,
      end,
      targetUserId,
    );
    return {
      businessDate,
      timezone,
      employee: target,
      summary: this.summarize(accounts),
      accounts,
    };
  }

  async assertCanEndWork(actor: RestaurantActor) {
    const open = await this.prisma.restaurantCashSession.findFirst({
      where: {
        organizationId: actor.organizationId,
        responsibleUserId: actor.id,
        openGuard: { not: null },
      },
      include: {
        cashRegister: { select: { name: true } },
      },
    });
    if (open) {
      throw new ConflictException(
        `Debe entregar o cerrar ${open.cashRegister.name} antes de finalizar la sesiÃ³n`,
      );
    }
    return true;
  }
}