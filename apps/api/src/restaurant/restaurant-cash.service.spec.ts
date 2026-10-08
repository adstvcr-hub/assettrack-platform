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

  it("reconciles opening cash, cash sales and cash outflows on handoff", async () => {
    const update = vi.fn().mockImplementation(({ data }) => ({ id: "session-a", ...data }));
    const prisma = {
      restaurantCashSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: "session-a",
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
    const service = new RestaurantCashService(prisma as never);

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
});
