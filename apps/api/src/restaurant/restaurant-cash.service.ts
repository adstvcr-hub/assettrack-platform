import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import { assertCashDayConfirmed, cashTransaction } from "./cash-day-context";
import { PrismaService } from "../prisma/prisma.service";
import {
  RestaurantCashSessionStatus,
  RestaurantItemStatus,
  RestaurantPaymentMethod,
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  RestaurantSupplierInvoiceStatus,
  RestaurantVisitStatus,
  UserRole,
} from "../generated/prisma/enums";
import {
  getUtcDateRangeForLocalDate,
  normalizeTimezone,
} from "../common/timezone-date-range";
import type { RestaurantActor } from "./restaurant.service";
import type {
  CloseCashSessionDto,
  CreateEmployeePaymentDto,
  CreateSupplierInvoiceDto,
} from "./dto/restaurant.dto";

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
    scope?: Prisma.RestaurantVisitWhereInput,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const visits = await db.restaurantVisit.findMany({
      where: {
        organizationId,
        status: RestaurantVisitStatus.CLOSED,
        ...(scope ?? { cashDayId: null, closedAt: { gte: start, lt: end } }),
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
        paymentMethod: visit.paymentMethod,
        paymentReference: visit.paymentReference,
        billing,
      };
    });
  }

  private summarize(
    accounts: Array<{
      billing: { total: number };
      paymentMethod?: RestaurantPaymentMethod | null;
    }>,
  ) {
    const byMethod = {
      cashSales: 0,
      sinpeSales: 0,
      cardSales: 0,
      otherSales: 0,
    };
    for (const account of accounts) {
      if (account.paymentMethod === RestaurantPaymentMethod.CASH) {
        byMethod.cashSales += account.billing.total;
      } else if (account.paymentMethod === RestaurantPaymentMethod.SINPE) {
        byMethod.sinpeSales += account.billing.total;
      } else if (account.paymentMethod === RestaurantPaymentMethod.CARD) {
        byMethod.cardSales += account.billing.total;
      } else {
        byMethod.otherSales += account.billing.total;
      }
    }
    return {
      accountCount: accounts.length,
      salesTotal: accounts.reduce(
        (sum, account) => sum + account.billing.total,
        0,
      ),
      ...byMethod,
    };
  }

  private summarizeEmployeePayments(
    payments: Array<{
      amount: number;
      paymentMethod: RestaurantPaymentMethod;
    }>,
  ) {
    const summary = {
      employeePaymentsTotal: 0,
      cashEmployeePayments: 0,
      sinpeEmployeePayments: 0,
      cardEmployeePayments: 0,
      otherEmployeePayments: 0,
    };
    for (const payment of payments) {
      summary.employeePaymentsTotal += payment.amount;
      if (payment.paymentMethod === RestaurantPaymentMethod.CASH) {
        summary.cashEmployeePayments += payment.amount;
      } else if (payment.paymentMethod === RestaurantPaymentMethod.SINPE) {
        summary.sinpeEmployeePayments += payment.amount;
      } else if (payment.paymentMethod === RestaurantPaymentMethod.CARD) {
        summary.cardEmployeePayments += payment.amount;
      } else {
        summary.otherEmployeePayments += payment.amount;
      }
    }
    return summary;
  }

  private async cashMovements(
    organizationId: string,
    start: Date,
    end: Date,
    cashSessionId?: string,
    cashDayId?: string,
    businessDate?: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const dayFilter = cashDayId
      ? { cashDayId }
      : businessDate
        ? { cashDay: { businessDate } }
        : null;
    const supplierInvoices = await db.restaurantSupplierInvoice.findMany({
      where: {
        organizationId,
        ...(cashSessionId
          ? { cashSessionId }
          : dayFilter
            ? {
                OR: [
                  { cashSession: dayFilter },
                  ...(!cashDayId
                    ? [
                        {
                          cashSession: { cashDayId: null },
                          OR: [
                            { createdAt: { gte: start, lt: end } },
                            { paidAt: { gte: start, lt: end } },
                          ],
                        },
                      ]
                    : []),
                ],
              }
            : {
                cashSession: { cashDayId: null },
                OR: [
                  { createdAt: { gte: start, lt: end } },
                  { paidAt: { gte: start, lt: end } },
                ],
              }),
      },
      include: {
        cashSession: { select: { cashDayId: true } },
        recordedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const employeePayments = await db.restaurantEmployeePayment.findMany({
      where: {
        organizationId,
        ...(cashSessionId
          ? { cashSessionId }
          : dayFilter
            ? {
                OR: [
                  { cashSession: dayFilter },
                  ...(!cashDayId
                    ? [
                        {
                          cashSession: { cashDayId: null },
                          paidAt: { gte: start, lt: end },
                        },
                      ]
                    : []),
                ],
              }
            : {
                cashSession: { cashDayId: null },
                paidAt: { gte: start, lt: end },
              }),
      },
      include: {
        employee: { select: { id: true, name: true, restaurantRole: true } },
        recordedBy: { select: { id: true, name: true } },
      },
      orderBy: { paidAt: "asc" },
    });
    const invoiceReceivedInRange = supplierInvoices.filter(
      (invoice) =>
        Boolean(cashSessionId || cashDayId || invoice.cashSession?.cashDayId) ||
        (invoice.createdAt >= start && invoice.createdAt < end),
    );
    const invoicePaidInRange = supplierInvoices.filter(
      (invoice) =>
        invoice.paidAt &&
        (Boolean(
          cashSessionId || cashDayId || invoice.cashSession?.cashDayId,
        ) ||
          (invoice.paidAt >= start && invoice.paidAt < end)),
    );
    const employeePaymentSummary =
      this.summarizeEmployeePayments(employeePayments);
    return {
      supplierInvoices,
      employeePayments,
      supplierInvoicesTotal: invoiceReceivedInRange.reduce(
        (sum, invoice) => sum + invoice.amount,
        0,
      ),
      supplierPaymentsTotal: invoicePaidInRange.reduce(
        (sum, invoice) => sum + invoice.amount,
        0,
      ),
      cashSupplierPayments: invoicePaidInRange
        .filter(
          (invoice) => invoice.paymentMethod === RestaurantPaymentMethod.CASH,
        )
        .reduce((sum, invoice) => sum + invoice.amount, 0),
      ...employeePaymentSummary,
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
    const cashDay = register
      ? await this.prisma.restaurantCashDay.findUnique({
          where: { openGuard: register.id },
        })
      : null;
    const timezone =
      cashDay?.timezone ?? (await this.timezone(actor.organizationId));
    const today = this.localDate(new Date(), timezone);
    const businessDate = cashDay?.businessDate ?? today;
    const dayClose =
      register && !cashDay
        ? await this.prisma.restaurantCashDayClose.findFirst({
            where: { cashRegisterId: register.id },
            orderBy: { closedAt: "desc" },
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
            undefined,
            { cashSessionId: session.id },
          ),
        )
      : null;
    const currentMovements = session
      ? await this.cashMovements(
          actor.organizationId,
          session.startedAt,
          new Date(),
          session.id,
        )
      : null;
    const currentReconciliation =
      session && currentSummary && currentMovements
        ? {
            openingCash: session.openingCash,
            cashSales: currentSummary.cashSales,
            cashSupplierPayments: currentMovements.cashSupplierPayments,
            cashEmployeePayments: currentMovements.cashEmployeePayments,
            expectedCash:
              session.openingCash +
              currentSummary.cashSales -
              currentMovements.cashSupplierPayments -
              currentMovements.cashEmployeePayments,
          }
        : null;

    return {
      canAccess,
      cashDayVersion: 1,
      cashDay,
      today,
      timezone,
      requiresContinuation: Boolean(
        cashDay && cashDay.lastConfirmedDate !== today,
      ),
      businessDate,
      register: register
        ? { id: register.id, name: register.name }
        : { id: null, name: "Caja principal" },
      session,
      currentSummary,
      currentMovements,
      currentReconciliation,
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
          "No puede retirar la autorización mientras la persona tenga una caja abierta",
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

  async assume(actor: RestaurantActor, openingCash: number) {
    const user = await this.currentUser(actor);
    if (!this.canAssume(actor, user)) {
      throw new ForbiddenException(
        "Este usuario no está autorizado para asumir la caja",
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
    if (!Number.isSafeInteger(openingCash) || openingCash < 0) {
      throw new BadRequestException(
        "El efectivo inicial debe ser un entero válido",
      );
    }
    const register = await this.defaultRegister(actor.organizationId);
    const timezone = await this.timezone(actor.organizationId);
    return cashTransaction(this.prisma, async (tx) => {
      const current = await tx.restaurantCashSession.findUnique({
        where: { openGuard: register.id },
        include: { responsibleUser: { select: { id: true, name: true } } },
      });
      if (current) {
        if (current.responsibleUserId === actor.id) return current;
        throw new ConflictException(
          `La caja ya está bajo responsabilidad de ${current.responsibleUser.name}`,
        );
      }
      let cashDay = await tx.restaurantCashDay.findUnique({
        where: { openGuard: register.id },
      });
      if (!cashDay) {
        const businessDate = this.localDate(new Date(), timezone);
        cashDay = await tx.restaurantCashDay.create({
          data: {
            organizationId: actor.organizationId,
            cashRegisterId: register.id,
            businessDate,
            openedAt: new Date(),
            timezone,
            lastConfirmedDate: businessDate,
            openingCash,
            openGuard: register.id,
          },
        });
      }
      return tx.restaurantCashSession.create({
        data: {
          organizationId: actor.organizationId,
          cashRegisterId: register.id,
          cashDayId: cashDay.id,
          startedAt: new Date(),
          responsibleUserId: actor.id,
          openGuard: register.id,
          openingCash,
        },
        include: {
          responsibleUser: {
            select: { id: true, name: true, restaurantRole: true },
          },
        },
      });
    });
  }

  async continueDay(actor: RestaurantActor, cashDayId: string) {
    return cashTransaction(this.prisma, async (tx) => {
      const session = await tx.restaurantCashSession.findFirst({
        where: {
          organizationId: actor.organizationId,
          cashDayId,
          responsibleUserId: actor.id,
          openGuard: { not: null },
        },
        include: { cashDay: true },
      });
      if (!session?.cashDay?.openGuard)
        throw new ConflictException(
          "Solo el responsable actual puede continuar esta jornada abierta.",
        );
      const continued = await tx.restaurantCashDay.update({
        where: { id: cashDayId },
        data: {
          lastConfirmedDate: this.localDate(
            new Date(),
            session.cashDay.timezone,
          ),
          continuedAt: new Date(),
          continuedById: actor.id,
        },
      });
      await tx.platformAdminEvent.create({
        data: {
          actorId: actor.id,
          organizationId: actor.organizationId,
          action: "RESTAURANT_CASH_DAY_CONTINUED",
          metadata: {
            cashDayId,
            businessDate: continued.businessDate,
            confirmedDate: continued.lastConfirmedDate,
            timezone: continued.timezone,
          },
        },
      });
      return continued;
    });
  }

  private async responsibleOpenSession(
    actor: RestaurantActor,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const session = await db.restaurantCashSession.findFirst({
      where: {
        organizationId: actor.organizationId,
        responsibleUserId: actor.id,
        openGuard: { not: null },
      },
      include: { cashDay: true },
    });
    if (!session) {
      throw new ConflictException(
        "Debe tener la caja a su nombre para registrar este movimiento",
      );
    }
    if (!session.cashDay?.openGuard)
      throw new ConflictException("La jornada de caja ya está cerrada.");
    assertCashDayConfirmed(session.cashDay);
    return session;
  }

  async employees(actor: RestaurantActor) {
    const user = await this.currentUser(actor);
    if (!this.canAssume(actor, user)) {
      throw new ForbiddenException("Cash register access required");
    }
    return this.prisma.user.findMany({
      where: {
        organizationId: actor.organizationId,
        active: true,
        role: UserRole.USER,
        restaurantRole: { not: null },
      },
      select: { id: true, name: true, restaurantRole: true },
      orderBy: { name: "asc" },
    });
  }

  async addSupplierInvoice(
    actor: RestaurantActor,
    dto: CreateSupplierInvoiceDto,
  ) {
    if (
      dto.status === RestaurantSupplierInvoiceStatus.PAID &&
      !dto.paymentMethod
    ) {
      throw new BadRequestException(
        "Indique el método usado para pagar la factura",
      );
    }
    return cashTransaction(this.prisma, async (tx) => {
      const session = await this.responsibleOpenSession(actor, tx);
      const supplierName = dto.supplierName.trim();
      const invoiceNumber = dto.invoiceNumber.trim();
      const duplicate = await tx.restaurantSupplierInvoice.findUnique({
        where: {
          organizationId_supplierName_invoiceNumber: {
            organizationId: actor.organizationId,
            supplierName,
            invoiceNumber,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          "Esta factura de proveedor ya fue registrada",
        );
      }
      return tx.restaurantSupplierInvoice.create({
        data: {
          organizationId: actor.organizationId,
          cashSessionId: session.id,
          recordedById: actor.id,
          supplierName,
          invoiceNumber,
          invoiceDate: dto.invoiceDate.slice(0, 10),
          amount: dto.amount,
          status: dto.status,
          paymentMethod:
            dto.status === RestaurantSupplierInvoiceStatus.PAID
              ? dto.paymentMethod
              : null,
          paidAt:
            dto.status === RestaurantSupplierInvoiceStatus.PAID
              ? new Date()
              : null,
          note: dto.note?.trim() || null,
        },
        include: { recordedBy: { select: { id: true, name: true } } },
      });
    });
  }

  async addEmployeePayment(
    actor: RestaurantActor,
    dto: CreateEmployeePaymentDto,
  ) {
    return cashTransaction(this.prisma, async (tx) => {
      const session = await this.responsibleOpenSession(actor, tx);
      const employee = await tx.user.findFirst({
        where: {
          id: dto.employeeId,
          organizationId: actor.organizationId,
          active: true,
          role: UserRole.USER,
          restaurantRole: { not: null },
        },
        select: { id: true },
      });
      if (!employee) throw new NotFoundException("Employee not found");
      return tx.restaurantEmployeePayment.create({
        data: {
          organizationId: actor.organizationId,
          cashSessionId: session.id,
          employeeId: employee.id,
          recordedById: actor.id,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          paidAt: new Date(),
          note: dto.note?.trim() || null,
        },
        include: {
          employee: { select: { id: true, name: true, restaurantRole: true } },
          recordedBy: { select: { id: true, name: true } },
        },
      });
    });
  }

  async close(
    actor: RestaurantActor,
    sessionId: string,
    dto: CloseCashSessionDto,
  ) {
    return cashTransaction(this.prisma, async (tx) => {
      const session = await tx.restaurantCashSession.findFirst({
        where: {
          id: sessionId,
          organizationId: actor.organizationId,
          openGuard: { not: null },
        },
        include: {
          cashDay: true,
          cashRegister: true,
          responsibleUser: {
            select: { id: true, name: true, restaurantRole: true },
          },
        },
      });
      if (!session) throw new NotFoundException("Open cash session not found");
      if (!session.cashDay?.openGuard)
        throw new ConflictException("La jornada de caja ya está cerrada.");
      const cashDay = session.cashDay;

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
        undefined,
        { cashSessionId: session.id },
        tx,
      );
      const sessionSummary = this.summarize(sessionAccounts);
      const sessionMovements = await this.cashMovements(
        actor.organizationId,
        session.startedAt,
        now,
        session.id,
        undefined,
        undefined,
        tx,
      );
      const sessionExpectedCash =
        session.openingCash +
        sessionSummary.cashSales -
        sessionMovements.cashSupplierPayments -
        sessionMovements.cashEmployeePayments;
      const sessionDiscrepancy = dto.countedCash - sessionExpectedCash;
      const closeNote = dto.note?.trim() || null;

      if (!dto.finalDailyClose) {
        return tx.restaurantCashSession.update({
          where: { id: session.id },
          data: {
            endedAt: now,
            status: RestaurantCashSessionStatus.CLOSED_HANDOFF,
            openGuard: null,
            accountCount: sessionSummary.accountCount,
            salesTotal: sessionSummary.salesTotal,
            expectedCash: sessionExpectedCash,
            countedCash: dto.countedCash,
            discrepancy: sessionDiscrepancy,
            closeNote:
              closeNote ??
              (isAdmin && !isResponsible
                ? `Liberada por administración (${actor.id})`
                : "Entrega de caja"),
          },
          include: {
            responsibleUser: {
              select: { id: true, name: true, restaurantRole: true },
            },
          },
        });
      }

      const businessDate = cashDay.businessDate;
      const daySummary = this.summarize(
        await this.accountsBetween(
          actor.organizationId,
          cashDay.openedAt,
          now,
          undefined,
          { cashDayId: cashDay.id },
          tx,
        ),
      );
      const dayMovements = await this.cashMovements(
        actor.organizationId,
        cashDay.openedAt,
        now,
        undefined,
        cashDay.id,
        undefined,
        tx,
      );
      const sessionCount = await tx.restaurantCashSession.count({
        where: { cashDayId: cashDay.id },
      });
      const dayOpeningCash = cashDay.openingCash;
      const dayExpectedCash =
        dayOpeningCash +
        daySummary.cashSales -
        dayMovements.cashSupplierPayments -
        dayMovements.cashEmployeePayments;
      const dayDiscrepancy = dto.countedCash - dayExpectedCash;

      await tx.restaurantCashDay.update({
        where: { id: cashDay.id },
        data: { openGuard: null, closedAt: now },
      });
      const closedSession = await tx.restaurantCashSession.update({
        where: { id: session.id },
        data: {
          endedAt: now,
          status: RestaurantCashSessionStatus.CLOSED_DAY,
          openGuard: null,
          accountCount: sessionSummary.accountCount,
          salesTotal: sessionSummary.salesTotal,
          expectedCash: sessionExpectedCash,
          countedCash: dto.countedCash,
          discrepancy: sessionDiscrepancy,
          closeNote,
        },
      });
      const dayClose = await tx.restaurantCashDayClose.create({
        data: {
          organizationId: actor.organizationId,
          cashRegisterId: session.cashRegisterId,
          businessDate,
          cashDayId: cashDay.id,
          closedAt: now,
          responsibleUserId: actor.id,
          accountCount: daySummary.accountCount,
          salesTotal: daySummary.salesTotal,
          sessionCount,
          openingCash: dayOpeningCash,
          cashSales: daySummary.cashSales,
          sinpeSales: daySummary.sinpeSales,
          cardSales: daySummary.cardSales,
          otherSales: daySummary.otherSales,
          supplierInvoicesTotal: dayMovements.supplierInvoicesTotal,
          supplierPaymentsTotal: dayMovements.supplierPaymentsTotal,
          employeePaymentsTotal: dayMovements.employeePaymentsTotal,
          expectedCash: dayExpectedCash,
          countedCash: dto.countedCash,
          discrepancy: dayDiscrepancy,
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

  async daily(
    actor: RestaurantActor,
    requestedDate?: string,
    cashDayId?: string,
  ) {
    const user = await this.currentUser(actor);
    if (!this.canAssume(actor, user)) {
      throw new ForbiddenException("Cash register access required");
    }
    const cashDay = cashDayId
      ? await this.prisma.restaurantCashDay.findFirst({
          where: { id: cashDayId, organizationId: actor.organizationId },
        })
      : null;
    if (cashDayId && !cashDay)
      throw new NotFoundException("Cash day not found");
    const timezone =
      cashDay?.timezone ?? (await this.timezone(actor.organizationId));
    const businessDate =
      cashDay?.businessDate ??
      requestedDate ??
      this.localDate(new Date(), timezone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      throw new BadRequestException("Use date in YYYY-MM-DD format");
    }
    const { start, end } = getUtcDateRangeForLocalDate(businessDate, timezone);
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
        accounts: [],
        supplierInvoices: [],
        employeePayments: [],
        daySummary: {
          accountCount: 0,
          salesTotal: 0,
          cashSales: 0,
          sinpeSales: 0,
          cardSales: 0,
          otherSales: 0,
        },
        reconciliation: {
          openingCash: 0,
          cashSupplierPayments: 0,
          cashEmployeePayments: 0,
          expectedCash: 0,
        },
      };
    }

    const sessions = await this.prisma.restaurantCashSession.findMany({
      where: {
        cashRegisterId: register.id,
        ...(cashDayId
          ? { cashDayId }
          : {
              OR: [
                { cashDay: { businessDate } },
                {
                  cashDayId: null,
                  startedAt: { lt: end },
                  OR: [{ endedAt: null }, { endedAt: { gte: start } }],
                },
              ],
            }),
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
          undefined,
          { cashSessionId: session.id },
        ),
      );
      sessionRows.push({
        ...session,
        accountCount: currentSummary.accountCount,
        salesTotal: currentSummary.salesTotal,
      });
    }

    const dayClose = await this.prisma.restaurantCashDayClose.findFirst({
      where: {
        cashRegisterId: register.id,
        ...(cashDayId ? { cashDayId } : { businessDate }),
      },
      orderBy: { closedAt: "desc" },
      include: {
        responsibleUser: {
          select: { id: true, name: true, restaurantRole: true },
        },
      },
    });
    const accounts = await this.accountsBetween(
      actor.organizationId,
      start,
      end,
      undefined,
      cashDayId
        ? { cashDayId }
        : {
            OR: [
              { cashDay: { businessDate } },
              { cashDayId: null, closedAt: { gte: start, lt: end } },
            ],
          },
    );
    const daySummary = this.summarize(accounts);
    const movements = await this.cashMovements(
      actor.organizationId,
      start,
      end,
      undefined,
      cashDayId,
      businessDate,
    );
    const openingCash =
      cashDay?.openingCash ??
      sessions
        .filter(
          (session, index) =>
            sessions.findIndex(
              (other) => other.cashDayId === session.cashDayId,
            ) === index,
        )
        .reduce((sum, session) => sum + session.openingCash, 0);
    const expectedCash =
      openingCash +
      daySummary.cashSales -
      movements.cashSupplierPayments -
      movements.cashEmployeePayments;

    return {
      businessDate,
      timezone,
      register: { id: register.id, name: register.name },
      sessions: sessionRows,
      dayClose,
      daySummary,
      accounts,
      supplierInvoices: movements.supplierInvoices,
      employeePayments: movements.employeePayments,
      reconciliation: {
        openingCash,
        cashSupplierPayments: movements.cashSupplierPayments,
        cashEmployeePayments: movements.cashEmployeePayments,
        supplierInvoicesTotal: movements.supplierInvoicesTotal,
        supplierPaymentsTotal: movements.supplierPaymentsTotal,
        employeePaymentsTotal: movements.employeePaymentsTotal,
        expectedCash,
      },
    };
  }

  async history(
    actor: RestaurantActor,
    requestedFrom?: string,
    requestedTo?: string,
  ) {
    const user = await this.currentUser(actor);
    if (!this.canAssume(actor, user)) {
      throw new ForbiddenException("Cash register access required");
    }
    const timezone = await this.timezone(actor.organizationId);
    const today = this.localDate(new Date(), timezone);
    const to = requestedTo ?? today;
    const defaultFromDate = new Date(`${to}T12:00:00.000Z`);
    defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
    const from = requestedFrom ?? defaultFromDate.toISOString().slice(0, 10);
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T00:00:00.000Z`);
    if (
      !datePattern.test(from) ||
      !datePattern.test(to) ||
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime()) ||
      fromDate.toISOString().slice(0, 10) !== from ||
      toDate.toISOString().slice(0, 10) !== to
    ) {
      throw new BadRequestException("Use dates in YYYY-MM-DD format");
    }
    if (from > to) {
      throw new BadRequestException(
        "La fecha inicial no puede ser posterior a la fecha final",
      );
    }
    const rangeDays =
      Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    if (rangeDays > 366) {
      throw new BadRequestException(
        "El historial permite consultar un máximo de 366 días",
      );
    }

    const { start: historyStart } = getUtcDateRangeForLocalDate(from, timezone);
    const { end: historyEnd } = getUtcDateRangeForLocalDate(to, timezone);
    const [storedCloses, employeePayments] = await Promise.all([
      this.prisma.restaurantCashDayClose.findMany({
        where: {
          organizationId: actor.organizationId,
          businessDate: { gte: from, lte: to },
        },
        include: {
          cashRegister: { select: { id: true, name: true } },
          responsibleUser: {
            select: { id: true, name: true, restaurantRole: true },
          },
        },
        orderBy: [{ businessDate: "desc" }, { closedAt: "desc" }],
      }),
      this.prisma.restaurantEmployeePayment.findMany({
        where: {
          organizationId: actor.organizationId,
          OR: [
            {
              cashSession: {
                cashDay: { businessDate: { gte: from, lte: to } },
              },
            },
            {
              cashSession: { cashDayId: null },
              paidAt: { gte: historyStart, lt: historyEnd },
            },
          ],
        },
        include: {
          cashSession: { select: { cashRegisterId: true, cashDayId: true } },
          employee: {
            select: { id: true, name: true, restaurantRole: true },
          },
          recordedBy: { select: { id: true, name: true } },
        },
        orderBy: { paidAt: "asc" },
      }),
    ]);
    const paymentsByClose = new Map<string, typeof employeePayments>();
    for (const payment of employeePayments) {
      const key =
        payment.cashSession.cashDayId ??
        `${payment.cashSession.cashRegisterId}:${this.localDate(payment.paidAt, timezone)}`;
      const group = paymentsByClose.get(key) ?? [];
      group.push(payment);
      paymentsByClose.set(key, group);
    }
    const closes = storedCloses.map((close) => {
      const payments =
        paymentsByClose.get(
          close.cashDayId ?? `${close.cashRegisterId}:${close.businessDate}`,
        ) ?? [];
      const detailSummary = this.summarizeEmployeePayments(payments);
      const breakdownComplete =
        detailSummary.employeePaymentsTotal === close.employeePaymentsTotal;
      return {
        ...close,
        employeePayments: payments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          note: payment.note,
          paidAt: payment.paidAt,
          employee: payment.employee,
          recordedBy: payment.recordedBy,
        })),
        employeePaymentSummary: {
          ...detailSummary,
          employeePaymentsTotal: close.employeePaymentsTotal,
          breakdownComplete,
        },
      };
    });
    const totals = closes.reduce(
      (summary, close) => ({
        accountCount: summary.accountCount + close.accountCount,
        salesTotal: summary.salesTotal + close.salesTotal,
        cashSales: summary.cashSales + close.cashSales,
        sinpeSales: summary.sinpeSales + close.sinpeSales,
        cardSales: summary.cardSales + close.cardSales,
        otherSales: summary.otherSales + close.otherSales,
        employeePaymentsTotal:
          summary.employeePaymentsTotal +
          close.employeePaymentSummary.employeePaymentsTotal,
        cashEmployeePayments:
          summary.cashEmployeePayments +
          close.employeePaymentSummary.cashEmployeePayments,
        sinpeEmployeePayments:
          summary.sinpeEmployeePayments +
          close.employeePaymentSummary.sinpeEmployeePayments,
        cardEmployeePayments:
          summary.cardEmployeePayments +
          close.employeePaymentSummary.cardEmployeePayments,
        otherEmployeePayments:
          summary.otherEmployeePayments +
          close.employeePaymentSummary.otherEmployeePayments,
        incompleteEmployeePaymentBreakdowns:
          summary.incompleteEmployeePaymentBreakdowns +
          (close.employeePaymentSummary.breakdownComplete ? 0 : 1),
        discrepancy: summary.discrepancy + close.discrepancy,
      }),
      {
        accountCount: 0,
        salesTotal: 0,
        cashSales: 0,
        sinpeSales: 0,
        cardSales: 0,
        otherSales: 0,
        employeePaymentsTotal: 0,
        cashEmployeePayments: 0,
        sinpeEmployeePayments: 0,
        cardEmployeePayments: 0,
        otherEmployeePayments: 0,
        incompleteEmployeePaymentBreakdowns: 0,
        discrepancy: 0,
      },
    );

    return { from, to, timezone, closes, totals };
  }

  async employeeDaily(
    actor: RestaurantActor,
    requestedDate?: string,
    requestedUserId?: string,
    cashDayId?: string,
  ) {
    const cashDay = cashDayId
      ? await this.prisma.restaurantCashDay.findFirst({
          where: { id: cashDayId, organizationId: actor.organizationId },
        })
      : null;
    if (cashDayId && !cashDay)
      throw new NotFoundException("Cash day not found");
    const timezone =
      cashDay?.timezone ?? (await this.timezone(actor.organizationId));
    const businessDate =
      cashDay?.businessDate ??
      requestedDate ??
      this.localDate(new Date(), timezone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      throw new BadRequestException("Use date in YYYY-MM-DD format");
    }
    const targetUserId =
      requestedUserId && this.isAdministrator(actor)
        ? requestedUserId
        : actor.id;
    if (
      requestedUserId &&
      requestedUserId !== actor.id &&
      !this.isAdministrator(actor)
    ) {
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
    const { start, end } = getUtcDateRangeForLocalDate(businessDate, timezone);
    const accounts = await this.accountsBetween(
      actor.organizationId,
      start,
      end,
      targetUserId,
      cashDayId
        ? { cashDayId }
        : {
            OR: [
              { cashDay: { businessDate } },
              { cashDayId: null, closedAt: { gte: start, lt: end } },
            ],
          },
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
        `Debe entregar o cerrar ${open.cashRegister.name} antes de finalizar la sesión`,
      );
    }
    return true;
  }
}
