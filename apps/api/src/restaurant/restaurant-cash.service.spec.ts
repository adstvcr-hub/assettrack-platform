import { describe, expect, it, vi } from "vitest";
import {
  RestaurantCashSessionStatus,
  RestaurantItemStatus,
  RestaurantPaymentMethod,
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  RestaurantSupplierInvoiceStatus,
  UserRole,
} from "../generated/prisma/enums";
import { RestaurantCashService } from "./restaurant-cash.service";

const actor = {
  id: "user-cashier",
  organizationId: "org-a",
  role: UserRole.USER,
  restaurantRole: RestaurantStaffRole.CASHIER,
  restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
};

describe("RestaurantCashService", () => {
  it("separates closed sales by payment method", () => {
    const service = new RestaurantCashService({} as never);
    const summary = (
      service as unknown as {
        summarize: (accounts: Array<{
          billing: { total: number };
          paymentMethod?: RestaurantPaymentMethod | null;
        }>) => Record<string, number>;
      }
    ).summarize([
      { billing: { total: 1000 }, paymentMethod: RestaurantPaymentMethod.CASH },
      { billing: { total: 2000 }, paymentMethod: RestaurantPaymentMethod.SINPE },
      { billing: { total: 3000 }, paymentMethod: RestaurantPaymentMethod.CARD },
      { billing: { total: 4000 }, paymentMethod: null },
    ]);

    expect(summary).toEqual({
      accountCount: 4,
      salesTotal: 10000,
      cashSales: 1000,
      sinpeSales: 2000,
      cardSales: 3000,
      otherSales: 4000,
    });
  });

  it("separates employee payments by method and identifies the cash impact", () => {
    const service = new RestaurantCashService({} as never);
    const summary = (
      service as unknown as {
        summarizeEmployeePayments: (payments: Array<{
          amount: number;
          paymentMethod: RestaurantPaymentMethod;
        }>) => Record<string, number>;
      }
    ).summarizeEmployeePayments([
      { amount: 45000, paymentMethod: RestaurantPaymentMethod.CASH },
      { amount: 30000, paymentMethod: RestaurantPaymentMethod.SINPE },
      { amount: 20000, paymentMethod: RestaurantPaymentMethod.CARD },
      { amount: 5000, paymentMethod: RestaurantPaymentMethod.OTHER },
    ]);

    expect(summary).toEqual({
      employeePaymentsTotal: 100000,
      cashEmployeePayments: 45000,
      sinpeEmployeePayments: 30000,
      cardEmployeePayments: 20000,
      otherEmployeePayments: 5000,
    });
  });

  it("reconciles opening cash, cash sales and cash outflows on handoff", async () => {
    const update = vi.fn().mockImplementation(({ data }) => ({ id: "session-a", ...data }));
    const prisma = {
      restaurantCashSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: "session-a",
          cashDay: { id: "day-a", openGuard: "register-a", businessDate: "2026-10-08" },
          organizationId: "org-a",
          cashRegisterId: "register-a",
          responsibleUserId: actor.id,
          startedAt: new Date("2026-10-08T10:00:00.000Z"),
          openingCash: 10000,
          openGuard: "register-a",
          cashRegister: { id: "register-a" },
          responsibleUser: {
            id: actor.id,
            name: "Caja",
            restaurantRole: RestaurantStaffRole.CASHIER,
          },
        }),
        update,
      },
      restaurantVisit: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "visit-a",
            receiptNumber: "R-1",
            closedAt: new Date("2026-10-08T11:00:00.000Z"),
            paymentMethod: RestaurantPaymentMethod.CASH,
            paymentReference: null,
            table: { name: "Mesa 1", kind: "DINING" },
            taxRateBps: 0,
            taxIncluded: false,
            serviceRateBps: 0,
            serviceChargeEnabled: false,
            orders: [
              {
                promotionCredit: 0,
                items: [
                  {
                    name: "Producto",
                    price: 5000,
                    quantity: 1,
                    status: RestaurantItemStatus.DELIVERED,
                  },
                ],
              },
            ],
          },
        ]),
      },
      restaurantSupplierInvoice: {
        findMany: vi.fn().mockResolvedValue([
          {
            amount: 2000,
            paymentMethod: RestaurantPaymentMethod.CASH,
            createdAt: new Date("2026-10-08T10:15:00.000Z"),
            paidAt: new Date("2026-10-08T10:15:00.000Z"),
          },
        ]),
      },
      restaurantEmployeePayment: {
        findMany: vi.fn().mockResolvedValue([
          {
            amount: 1000,
            paymentMethod: RestaurantPaymentMethod.CASH,
            paidAt: new Date("2026-10-08T10:30:00.000Z"),
          },
        ]),
      },
    };
    const transactionalPrisma = { ...prisma, $transaction: vi.fn((callback) => callback(prisma)) };
    const service = new RestaurantCashService(transactionalPrisma as never);

    await service.close(actor, "session-a", {
      finalDailyClose: false,
      countedCash: 11900,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RestaurantCashSessionStatus.CLOSED_HANDOFF,
          expectedCash: 12000,
          countedCash: 11900,
          discrepancy: -100,
        }),
      }),
    );
  });

  it("requires a payment method for a paid supplier invoice", async () => {
    const prisma = {
      restaurantCashSession: {
        findFirst: vi.fn().mockResolvedValue({ id: "session-a" }),
      },
    };
    const service = new RestaurantCashService(prisma as never);

    await expect(
      service.addSupplierInvoice(actor, {
        supplierName: "Proveedor",
        invoiceNumber: "F-1",
        invoiceDate: "2026-10-08",
        amount: 1000,
        status: RestaurantSupplierInvoiceStatus.PAID,
      }),
    ).rejects.toThrow("Indique el método usado para pagar la factura");
  });

  it("returns general cash closes and totals for a date range", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "close-b",
        cashRegisterId: "register-a",
        businessDate: "2026-10-08",
        accountCount: 4,
        salesTotal: 20000,
        cashSales: 7000,
        sinpeSales: 5000,
        cardSales: 8000,
        otherSales: 0,
        supplierInvoicesTotal: 0,
        supplierPaymentsTotal: 0,
        employeePaymentsTotal: 3000,
        discrepancy: -100,
      },
      {
        id: "close-a",
        cashRegisterId: "register-a",
        businessDate: "2026-10-07",
        accountCount: 3,
        salesTotal: 15000,
        cashSales: 6000,
        sinpeSales: 4000,
        cardSales: 3000,
        otherSales: 2000,
        supplierInvoicesTotal: 0,
        supplierPaymentsTotal: 0,
        employeePaymentsTotal: 1500,
        discrepancy: 100,
      },
    ]);
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: actor.id,
          name: "Caja",
          restaurantRole: RestaurantStaffRole.CASHIER,
          restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
          restaurantCashAuthorized: true,
        }),
      },
      organizationLocation: {
        findFirst: vi.fn().mockResolvedValue({
          timezone: "America/Costa_Rica",
        }),
      },
      restaurantCashDayClose: { findMany },
      restaurantSupplierInvoice: { findMany: vi.fn().mockResolvedValue([]) },
      restaurantEmployeePayment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "payment-a",
            amount: 1500,
            paymentMethod: RestaurantPaymentMethod.CASH,
            note: "Pago de jornada",
            paidAt: new Date("2026-10-07T18:00:00.000Z"),
            cashSession: { cashRegisterId: "register-a" },
            employee: {
              id: "employee-a",
              name: "Empleado A",
              restaurantRole: RestaurantStaffRole.WAITER,
            },
            recordedBy: { id: actor.id, name: "Caja" },
          },
          {
            id: "payment-b",
            amount: 1000,
            paymentMethod: RestaurantPaymentMethod.CASH,
            note: null,
            paidAt: new Date("2026-10-08T18:00:00.000Z"),
            cashSession: { cashRegisterId: "register-a" },
            employee: {
              id: "employee-b",
              name: "Empleado B",
              restaurantRole: RestaurantStaffRole.KITCHEN,
            },
            recordedBy: { id: actor.id, name: "Caja" },
          },
          {
            id: "payment-c",
            amount: 2000,
            paymentMethod: RestaurantPaymentMethod.SINPE,
            note: null,
            paidAt: new Date("2026-10-08T19:00:00.000Z"),
            cashSession: { cashRegisterId: "register-a" },
            employee: {
              id: "employee-c",
              name: "Empleado C",
              restaurantRole: RestaurantStaffRole.BAR,
            },
            recordedBy: { id: actor.id, name: "Caja" },
          },
        ]),
      },
    };
    const service = new RestaurantCashService(prisma as never);

    const result = await service.history(
      actor,
      "2026-10-01",
      "2026-10-08",
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-a",
        businessDate: { gte: "2026-10-01", lte: "2026-10-08" },
      },
      include: {
        cashRegister: { select: { id: true, name: true } },
        responsibleUser: {
          select: { id: true, name: true, restaurantRole: true },
        },
      },
      orderBy: [{ businessDate: "desc" }, { closedAt: "desc" }],
    });
    expect(result.totals).toEqual({
      accountCount: 7,
      salesTotal: 35000,
      cashSales: 13000,
      sinpeSales: 9000,
      cardSales: 11000,
      otherSales: 2000,
      employeePaymentsTotal: 4500,
      cashEmployeePayments: 2500,
      sinpeEmployeePayments: 2000,
      cardEmployeePayments: 0,
      otherEmployeePayments: 0,
      incompleteEmployeePaymentBreakdowns: 0,
      discrepancy: 0,
    });
    expect(result.closes[0].employeePaymentSummary).toEqual({
      employeePaymentsTotal: 3000,
      cashEmployeePayments: 1000,
      sinpeEmployeePayments: 2000,
      cardEmployeePayments: 0,
      otherEmployeePayments: 0,
      breakdownComplete: true,
    });
    expect(result.closes[0].employeePayments).toHaveLength(2);
  });

  it("rejects an inverted cash close history range", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: actor.id,
          name: "Caja",
          restaurantRole: RestaurantStaffRole.CASHIER,
          restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
          restaurantCashAuthorized: true,
        }),
      },
      organizationLocation: {
        findFirst: vi.fn().mockResolvedValue({
          timezone: "America/Costa_Rica",
        }),
      },
    };
    const service = new RestaurantCashService(prisma as never);

    await expect(
      service.history(actor, "2026-10-09", "2026-10-01"),
    ).rejects.toThrow(
      "La fecha inicial no puede ser posterior a la fecha final",
    );
  });
});
