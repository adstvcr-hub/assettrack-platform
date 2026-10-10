import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { RestaurantService } from "./restaurant.service";
import {
  RestaurantPayPeriod,
  RestaurantInventoryProductType,
  RestaurantPaymentMethod,
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  UserRole,
} from "../generated/prisma/enums";

const table = {
  id: "table-a",
  organizationId: "org-a",
  active: true,
  serviceChargeEnabled: true,
};
const requestId = "995bb3ed-a5c4-405e-bc8a-c2b4f360853a";
const itemId = "0696245b-f10d-4faf-8445-2e21d3336faf";
const order = { id: "order-a", tableId: table.id, accessCode: "secret" };
const menuItem = {
  id: itemId,
  name: "Coffee",
  price: 1200,
  station: "BAR",
  course: "DRINK",
  productType: "Bebidas naturales",
  prepMinutes: 5,
};
const kitchenActor = {
  id: "staff",
  organizationId: "org-a",
  role: UserRole.USER,
  restaurantRole: RestaurantStaffRole.KITCHEN,
  restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
};
const waiterActor = {
  id: "waiter-a",
  organizationId: "org-a",
  role: UserRole.USER,
  restaurantRole: RestaurantStaffRole.WAITER,
  restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
};
function createService() {
  const prisma = {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi
        .fn()
        .mockResolvedValue([
          { restaurantRole: RestaurantStaffRole.KITCHEN },
          { restaurantRole: RestaurantStaffRole.BAR },
        ]),
    },
    restaurantTable: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({
        ...table,
        organization: {
          restaurantAccessEnabled: true,
          restaurantLatitude: null,
          restaurantLongitude: null,
          restaurantOrderRadiusMeters: 150,
        },
      }),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        restaurantTaxRateBps: 1300,
        restaurantTaxIncluded: false,
        restaurantServiceRateBps: 1000,
      }),
      update: vi.fn(),
    },
    organizationLocation: { findFirst: vi.fn().mockResolvedValue(null) },
    restaurantQrAccess: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    restaurantAnalyticsDaily: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    restaurantAnalyticsProductDaily: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
    restaurantVisit: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: "visit-a",
        accessCode: "visit-secret",
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    restaurantMenuItem: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([menuItem]),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    restaurantPromotion: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    restaurantOrder: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(order),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    restaurantOrderItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: "created-item" }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
    },
    restaurantInventoryCategory: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    restaurantInventoryProduct: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    restaurantRecipeIngredient: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    restaurantInventoryMovement: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    restaurantLiquorWeighing: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    restaurantItemEvent: { create: vi.fn(), createMany: vi.fn() },
    restaurantStaffEvent: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    restaurantStaffSession: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    restaurantCashSession: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
    },
    restaurantVisitTransfer: { create: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
    ),
  };
  return {
    prisma,
    service: new RestaurantService(prisma as unknown as PrismaService),
  };
}

describe("RestaurantService", () => {
  const payload = { requestId, items: [{ menuItemId: itemId, quantity: 2 }] };

  it.each([
    {},
    { latitude: 10.0, longitude: -84.2, locationAccuracy: 5 },
  ])("allows guest ordering regardless of location: %j", async (coordinates) => {
    const { prisma, service } = createService();
    prisma.restaurantTable.findUnique.mockResolvedValue({
      ...table,
      organization: {
        restaurantAccessEnabled: true,
        restaurantLatitude: 9.9281,
        restaurantLongitude: -84.0907,
        restaurantOrderRadiusMeters: 100,
      },
    });

    await expect(
      service.placeOrder("table-code", {
        ...payload,
        ...coordinates,
      }),
    ).resolves.toBeDefined();
    expect(prisma.restaurantOrder.create).toHaveBeenCalled();
  });

  it("creates delivery orders without occupying a table and waits for payment", async () => {
    const { prisma, service } = createService();
    prisma.user.findMany.mockResolvedValue([
      { id: "waiter-a", restaurantRole: RestaurantStaffRole.WAITER },
      { id: "kitchen-a", restaurantRole: RestaurantStaffRole.KITCHEN },
      { id: "bar-a", restaurantRole: RestaurantStaffRole.BAR },
    ]);

    await service.placeOrder("table-code", {
      ...payload,
      fulfillment: "DELIVERY",
      deliveryPhone: "8888-8888",
      deliveryAddress: "San José, 100 m norte del parque",
    });

    expect(prisma.restaurantVisit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          occupiesTable: false,
          serviceChargeEnabled: false,
          paymentStatus: "PENDING",
          responsibleStaffId: "waiter-a",
        }),
      }),
    );
    expect(prisma.restaurantOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fulfillment: "DELIVERY",
          items: {
            create: [expect.objectContaining({ fulfillment: "DELIVERY" })],
          },
        }),
      }),
    );
  });

  it("falls back to available bar staff for delivery payment validation", async () => {
    const { prisma, service } = createService();
    prisma.user.findMany.mockResolvedValue([
      { id: "bar-a", restaurantRole: RestaurantStaffRole.BAR },
    ]);

    await service.placeOrder("table-code", {
      ...payload,
      fulfillment: "DELIVERY",
      deliveryPhone: "8888-8888",
      deliveryAddress: "San José",
    });

    expect(prisma.restaurantVisit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ responsibleStaffId: "bar-a" }),
      }),
    );
  });

  it("assigns dining service to the bartender when no waiter is available", async () => {
    const { prisma, service } = createService();
    prisma.restaurantTable.findUnique.mockResolvedValue({
      ...table,
      kind: "DINING",
      waiterId: null,
      organization: {
        restaurantAccessEnabled: true,
        restaurantLatitude: null,
        restaurantLongitude: null,
        restaurantOrderRadiusMeters: 150,
      },
    });
    prisma.user.findMany
      .mockResolvedValueOnce([
        { restaurantRole: RestaurantStaffRole.KITCHEN },
        { restaurantRole: RestaurantStaffRole.BAR },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "bar-a",
          role: UserRole.USER,
          restaurantRole: RestaurantStaffRole.BAR,
        },
      ]);

    await service.placeOrder("table-code", payload);

    expect(prisma.restaurantVisit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          occupiesTable: true,
          responsibleStaffId: "bar-a",
        }),
      }),
    );
  });

  it("creates a bar-entered order under the authenticated bartender", async () => {
    const { prisma, service } = createService();
    const bartender = {
      id: "bar-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.BAR,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantTable.findFirst.mockResolvedValue({
      id: "table-a",
      code: "table-code",
    });
    prisma.restaurantVisit.findFirst.mockResolvedValue(null);

    await service.createStaffOrder(bartender, {
      tableId: "table-a",
      requestId,
      fulfillment: "DINE_IN",
      items: [{ menuItemId: itemId, quantity: 2 }],
    });

    expect(prisma.restaurantVisit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tableId: "table-a",
          responsibleStaffId: "bar-a",
          occupiesTable: true,
        }),
      }),
    );
    expect(prisma.restaurantOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tableId: "table-a",
          requestId,
        }),
      }),
    );
  });

  it("adds a bar-entered order to the table account after waiter reassignment", async () => {
    const { prisma, service } = createService();
    const bartender = {
      id: "bar-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.BAR,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantTable.findFirst.mockResolvedValue({
      id: "table-a",
      code: "table-code",
    });
    prisma.restaurantVisit.findMany.mockResolvedValue([
      { accessCode: "existing-account" },
    ]);
    prisma.restaurantVisit.findFirst.mockResolvedValue({
      id: "visit-existing",
      accessCode: "existing-account",
      tableId: "table-a",
      occupiesTable: true,
      responsibleStaffId: "waiter-a",
    });

    await service.createStaffOrder(bartender, {
      tableId: "table-a",
      requestId,
      fulfillment: "TAKEOUT",
      items: [{ menuItemId: itemId, quantity: 1 }],
    });

    expect(prisma.restaurantVisit.create).not.toHaveBeenCalled();
    expect(prisma.restaurantOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visitId: "visit-existing" }),
      }),
    );
  });

  it("requires an explicit account when a table has separate open accounts", async () => {
    const { prisma, service } = createService();
    const bartender = {
      id: "bar-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.BAR,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantTable.findFirst.mockResolvedValue({
      id: "table-a",
      code: "table-code",
    });
    prisma.restaurantVisit.findMany.mockResolvedValue([
      { accessCode: "account-a" },
      { accessCode: "account-b" },
    ]);

    await expect(
      service.createStaffOrder(bartender, {
        tableId: "table-a",
        requestId,
        fulfillment: "DINE_IN",
        items: [{ menuItemId: itemId, quantity: 1 }],
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.restaurantOrder.create).not.toHaveBeenCalled();
  });

  it("adds a bar order to the explicitly selected table account", async () => {
    const { prisma, service } = createService();
    const bartender = {
      id: "bar-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.BAR,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantTable.findFirst.mockResolvedValue({
      id: "table-a",
      code: "table-code",
    });
    prisma.restaurantVisit.findMany.mockResolvedValue([
      { accessCode: "account-a" },
      { accessCode: "account-b" },
    ]);
    prisma.restaurantVisit.findFirst.mockResolvedValue({
      id: "visit-b",
      accessCode: "account-b",
      tableId: "table-a",
      occupiesTable: true,
    });

    await service.createStaffOrder(bartender, {
      tableId: "table-a",
      accountAccessCode: "account-b",
      requestId,
      fulfillment: "DINE_IN",
      items: [{ menuItemId: itemId, quantity: 1 }],
    });

    expect(prisma.restaurantOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visitId: "visit-b" }),
      }),
    );
  });

  it("recovers an orphaned delivered dining account for the bartender", async () => {
    const { prisma, service } = createService();
    const bartender = {
      id: "bar-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.BAR,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    const deliveredVisit = {
      id: "visit-lost",
      organizationId: "org-a",
      tableId: "table-a",
      openedAt: new Date(),
      occupiesTable: true,
      responsibleStaffId: "bar-a",
      responsibleStaff: {
        id: "bar-a",
        name: "Bartender",
        restaurantRole: RestaurantStaffRole.BAR,
      },
      table: {
        id: "table-a",
        name: "Mesa 2",
        kind: "DINING",
        waiterId: null,
        serviceChargeEnabled: true,
      },
      taxRateBps: 1300,
      taxIncluded: false,
      serviceRateBps: 1000,
      serviceChargeEnabled: true,
      paymentStatus: "NOT_REQUIRED",
      orders: [
        {
          id: "order-a",
          createdAt: new Date(),
          promotionCredit: 0,
          correctionRequestedAt: null,
          items: [
            {
              id: "item-a",
              name: "Pizza",
              price: 6000,
              quantity: 1,
              status: "DELIVERED",
            },
          ],
        },
      ],
    };
    prisma.restaurantVisit.findMany
      .mockResolvedValueOnce([
        {
          id: "visit-lost",
          responsibleStaffId: null,
          responsibleStaff: null,
          table: { kind: "DINING" },
        },
      ])
      .mockResolvedValueOnce([deliveredVisit]);
    prisma.user.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "bar-a",
          role: UserRole.USER,
          restaurantRole: RestaurantStaffRole.BAR,
        },
      ]);
    prisma.restaurantVisit.update.mockResolvedValue({});
    prisma.restaurantTable.findMany.mockResolvedValue([]);

    const result = await service.visits(bartender);

    expect(prisma.restaurantVisit.update).toHaveBeenCalledWith({
      where: { id: "visit-lost" },
      data: { responsibleStaffId: "bar-a" },
    });
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "visit-lost",
        canClose: true,
        responsibleStaff: expect.objectContaining({ id: "bar-a" }),
      }),
    );
  });

  it("keeps an unassigned delivery visible for administrative intervention", async () => {
    const { prisma, service } = createService();
    prisma.user.findMany
      .mockResolvedValueOnce([
        { id: "bar-station", restaurantRole: RestaurantStaffRole.BAR },
      ])
      .mockResolvedValueOnce([]);

    await service.placeOrder("table-code", {
      ...payload,
      fulfillment: "DELIVERY",
      deliveryPhone: "8888-8888",
      deliveryAddress: "San José",
    });

    expect(prisma.restaurantVisit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ responsibleStaffId: null }),
      }),
    );
  });

  it("records QR access without geographic verification or guest coordinates", async () => {
    const { prisma, service } = createService();
    prisma.restaurantTable.findUnique.mockResolvedValue({
      ...table,
      organization: {
        restaurantAccessEnabled: true,
        restaurantLatitude: 9.9281,
        restaurantLongitude: -84.0907,
        restaurantOrderRadiusMeters: 150,
      },
    });

    const result = await service.recordQrAccess("table-code", {
      sessionKey: "4e042db9-2f69-466f-bc62-8f50c9044ceb",
      latitude: 9.9282,
      longitude: -84.0907,
      accuracy: 8,
    });

    expect(prisma.restaurantQrAccess.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-a",
        tableId: "table-a",
        sessionKey: "4e042db9-2f69-466f-bc62-8f50c9044ceb",
        insideLocal: null,
      }),
    });
    expect(result).toMatchObject({ mode: "ONSITE", verificationRequired: false });
    const stored = prisma.restaurantQrAccess.create.mock.calls[0][0].data;
    expect(stored).not.toHaveProperty("latitude");
    expect(stored).not.toHaveProperty("longitude");
  });

  it("recognizes restaurant sales only from accounts closed in the period", async () => {
    const { prisma, service } = createService();
    prisma.organizationLocation.findFirst.mockResolvedValue({
      timezone: "UTC",
    });
    prisma.restaurantAnalyticsDaily.findMany.mockResolvedValue([
      {
        date: "2026-09-20",
        qrAccesses: 1,
        uniqueQrSessions: 1,
        visitsOpened: 1,
        visitsClosed: 1,
        orders: 2,
        grossSubtotal: 5000,
        promotionCredit: 1000,
        subtotal: 4000,
        tax: 520,
        service: 400,
        total: 4920,
        itemsSold: 2,
        itemsCancelled: 0,
      },
    ]);
    prisma.restaurantAnalyticsProductDaily.groupBy.mockResolvedValue([
      { productName: "Almuerzo", _sum: { quantity: 2 } },
    ]);
    prisma.restaurantVisit.count.mockResolvedValue(3);

    const result = await service.analytics(
      {
        id: "admin-a",
        organizationId: "org-a",
        role: UserRole.ADMIN,
        restaurantRole: RestaurantStaffRole.RESTAURANT_ADMIN,
        restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
      },
      "2026-09-01",
      "2026-09-30",
    );

    expect(result).toEqual(
      expect.objectContaining({
        qrAccesses: 1,
        uniqueQrSessions: 1,
        visitsOpened: 1,
        visitsClosed: 1,
        openVisits: 3,
        orders: 2,
        grossSubtotal: 5000,
        promotionCredit: 1000,
        subtotal: 4000,
        itemsSold: 2,
      }),
    );
  });

  it("summarizes every closed account in the selected sales-history range", async () => {
    const { prisma, service } = createService();
    prisma.organization.findUniqueOrThrow.mockResolvedValue({
      restaurantRetentionDays: 30,
    });
    prisma.organizationLocation.findFirst.mockResolvedValue({
      timezone: "UTC",
    });
    const detailedVisit = {
      id: "visit-closed",
      receiptNumber: "AT-20260920-TEST",
      openedAt: new Date("2026-09-20T12:00:00.000Z"),
      closedAt: new Date("2026-09-20T13:00:00.000Z"),
      table: { name: "Mesa 4", kind: "DINING" },
      responsibleStaff: { name: "Katherine" },
      taxRateBps: 1300,
      taxIncluded: false,
      serviceRateBps: 1000,
      serviceChargeEnabled: true,
      invoiceRequestStatus: "NOT_REQUESTED",
      invoiceRequestedAt: null,
      invoiceName: null,
      invoiceEmail: null,
      invoicePhone: null,
      invoiceTaxId: null,
      invoiceReference: null,
      orders: [
        {
          createdAt: new Date("2026-09-20T12:05:00.000Z"),
          promotionCredit: 500,
          items: [
            {
              id: "item-closed",
              name: "Casado",
              quantity: 2,
              price: 2500,
              status: "DELIVERED",
              fulfillment: "DINE_IN",
            },
          ],
        },
      ],
    };
    prisma.restaurantVisit.findMany
      .mockResolvedValueOnce([detailedVisit])
      .mockResolvedValueOnce([
        {
          table: { name: detailedVisit.table.name },
          responsibleStaff: detailedVisit.responsibleStaff,
          taxRateBps: detailedVisit.taxRateBps,
          taxIncluded: detailedVisit.taxIncluded,
          serviceRateBps: detailedVisit.serviceRateBps,
          serviceChargeEnabled: detailedVisit.serviceChargeEnabled,
          orders: detailedVisit.orders.map((closedOrder) => ({
            promotionCredit: closedOrder.promotionCredit,
            items: closedOrder.items.map(({ price, quantity, status }) => ({
              price,
              quantity,
              status,
            })),
          })),
        },
      ]);
    prisma.restaurantVisit.count.mockResolvedValue(1);

    const result = await service.salesHistory(
      {
        id: "admin-a",
        organizationId: "org-a",
        role: UserRole.ADMIN,
        restaurantRole: RestaurantStaffRole.RESTAURANT_ADMIN,
        restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
      },
      "",
      "2026-09-01",
      "2026-09-30",
      1,
      50,
    );

    expect(result.summary).toEqual({
      accounts: 1,
      orders: 1,
      items: 2,
      billing: {
        grossSubtotal: 5000,
        promotionCredit: 500,
        subtotal: 4500,
        tax: 585,
        service: 450,
        total: 5535,
      },
      byResponsible: [
        { name: "Katherine", accounts: 1, orders: 1, total: 5535 },
      ],
      byTable: [{ name: "Mesa 4", accounts: 1, orders: 1, total: 5535 }],
    });
  });

  it("takes menu snapshots only from the restaurant owning the table", async () => {
    const { prisma, service } = createService();
    await service.placeOrder("table-code", payload);
    expect(prisma.restaurantMenuItem.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [itemId] },
        organizationId: "org-a",
        active: true,
        station: { in: ["KITCHEN", "BAR"] },
      },
    });
    expect(prisma.restaurantOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-a",
          tableId: "table-a",
          visitId: "visit-a",
          requestId,
          items: {
            create: [
              expect.objectContaining({
                name: "Coffee",
                price: 1200,
                quantity: 2,
                station: "BAR",
              }),
            ],
          },
        }),
      }),
    );
  });

  it("adds a new order to the private account supplied by the same device", async () => {
    const { prisma, service } = createService();
    prisma.restaurantVisit.findFirst.mockResolvedValue({
      id: "visit-existing",
      accessCode: "4e042db9-2f69-466f-bc62-8f50c9044ceb",
    });

    await service.placeOrder("table-code", {
      ...payload,
      accountAccessCode: "4e042db9-2f69-466f-bc62-8f50c9044ceb",
    });

    expect(prisma.restaurantVisit.create).not.toHaveBeenCalled();
    expect(prisma.restaurantOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visitId: "visit-existing" }),
      }),
    );
  });

  it("rejects a stale private account with a guest-friendly message", async () => {
    const { service } = createService();

    await expect(
      service.placeOrder("table-code", {
        ...payload,
        accountAccessCode: "4e042db9-2f69-466f-bc62-8f50c9044ceb",
      }),
    ).rejects.toThrow(
      "La cuenta anterior fue cerrada o trasladada a otra posición",
    );
  });

  it("keeps unavailable station items visible in the guest menu", async () => {
    const { prisma, service } = createService();
    prisma.restaurantTable.findUnique.mockResolvedValue({
      ...table,
      organization: {
        name: "AssetTrack Demo",
        restaurantTaxRateBps: 1300,
        restaurantTaxIncluded: false,
        restaurantServiceRateBps: 1000,
      },
      waiter: null,
    });
    prisma.user.findMany.mockResolvedValue([
      { restaurantRole: RestaurantStaffRole.KITCHEN },
    ]);
    const result = await service.guestMenu("table-code");
    expect(result.menu).toEqual([
      expect.objectContaining({ name: "Coffee", available: false }),
    ]);
    expect(result.billing).toEqual({
      taxRateBps: 1300,
      taxIncluded: false,
      serviceRateBps: 1000,
      serviceChargeEnabled: true,
    });
  });

  it("returns the restaurant visual identity with the guest menu", async () => {
    const { prisma, service } = createService();
    prisma.restaurantTable.findUnique.mockResolvedValue({
      ...table,
      organization: {
        name: "AssetTrack Demo",
        restaurantDisplayName: "Café del Parque",
        restaurantHeaderImageData: "data:image/png;base64,header",
        restaurantUseHeaderImage: true,
        restaurantMenuBackgroundImageData: "data:image/webp;base64,background",
        restaurantMenuBackgroundEnabled: true,
        restaurantMenuBackgroundPosition: "top",
        restaurantMenuBackgroundSize: "contain",
        restaurantTaxRateBps: 1300,
        restaurantTaxIncluded: false,
        restaurantServiceRateBps: 1000,
      },
      waiter: null,
    });

    const result = await service.guestMenu("table-code");

    expect(result.branding).toEqual({
      displayName: "Café del Parque",
      headerImageData: "data:image/png;base64,header",
      useHeaderImage: true,
      menuBackgroundImageData: "data:image/webp;base64,background",
      menuBackgroundEnabled: true,
      menuBackgroundPosition: "top",
      menuBackgroundSize: "contain",
    });
  });

  it("stores restaurant visual identity settings for administrators", async () => {
    const { prisma, service } = createService();
    const admin = {
      id: "admin-a",
      organizationId: "org-a",
      role: UserRole.ADMIN,
      restaurantRole: null,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };

    await service.updateBrandingSettings(admin, {
      displayName: "  Café del Parque  ",
      useHeaderImage: true,
      headerImageData: "data:image/png;base64,header",
      menuBackgroundEnabled: true,
      menuBackgroundImageData: "data:image/webp;base64,background",
      menuBackgroundPosition: "center",
      menuBackgroundSize: "cover",
    });

    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org-a" },
        data: expect.objectContaining({
          restaurantDisplayName: "Café del Parque",
          restaurantUseHeaderImage: true,
          restaurantMenuBackgroundEnabled: true,
          restaurantMenuBackgroundPosition: "center",
          restaurantMenuBackgroundSize: "cover",
        }),
      }),
    );
  });

  it("shows only the assigned waiter's identity to a guest", async () => {
    const { prisma, service } = createService();
    prisma.restaurantVisit.findUnique.mockResolvedValue({
      id: "visit-a",
      accessCode: "secret",
      status: "OPEN",
      openedAt: new Date(),
      organization: {
        name: "Café del Parque",
        restaurantDisplayName: "Café del Parque Centro",
        restaurantHeaderImageData: "data:image/png;base64,header",
        restaurantUseHeaderImage: true,
      },
      table: {
        name: "Mesa 1",
        code: "table-code",
        serviceChargeEnabled: true,
        waiter: { id: "waiter-b", name: "Mesero 2" },
      },
      taxRateBps: 1300,
      taxIncluded: false,
      serviceRateBps: 1000,
      serviceChargeEnabled: true,
      orders: [],
    });

    const result = await service.guestOrder("secret");

    expect(result.table.waiter).toEqual({
      id: "waiter-b",
      name: "Mesero 2",
    });
    expect(result.branding).toEqual({
      displayName: "Café del Parque Centro",
      headerImageData: "data:image/png;base64,header",
      useHeaderImage: true,
    });
    expect(prisma.restaurantVisit.findUnique).toHaveBeenCalledWith({
      where: { accessCode: "secret" },
      include: expect.objectContaining({
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
        table: {
          select: {
            name: true,
            code: true,
            kind: true,
            serviceChargeEnabled: true,
            waiter: { select: { id: true, name: true } },
          },
        },
      }),
    });
  });

  it("replaces the latest received order during the correction window", async () => {
    const { prisma, service } = createService();
    const createdAt = new Date(Date.now() - 30_000);
    const currentOrder = {
      id: "order-latest",
      visitId: "visit-a",
      createdAt,
      fulfillment: "DINE_IN",
      promotionId: null,
      promotionCredit: 0,
      correctionRequestedAt: null,
      correctionRequestNote: null,
      lastCorrectionRequestId: null,
      items: [
        {
          id: "old-item",
          menuItemId: itemId,
          name: "Coffee",
          price: 1200,
          quantity: 1,
          status: "RECEIVED",
          fulfillment: "DINE_IN",
          cancelledByGuestCorrection: false,
        },
      ],
    };
    prisma.restaurantVisit.findUnique.mockResolvedValue({
      id: "visit-a",
      organizationId: "org-a",
      accessCode: "secret",
      status: "OPEN",
      openedAt: createdAt,
      occupiesTable: true,
      organization: {
        name: "Café",
        restaurantRetentionDays: 30,
        restaurantOrderCorrectionMinutes: 2,
      },
      table: {
        name: "Mesa 1",
        code: "table-code",
        kind: "DINING",
        serviceChargeEnabled: true,
        waiter: null,
      },
      taxRateBps: 1300,
      taxIncluded: false,
      serviceRateBps: 1000,
      serviceChargeEnabled: true,
      orders: [currentOrder],
    });
    prisma.restaurantOrder.findFirst.mockResolvedValue(currentOrder);
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.restaurantOrderItem.create.mockResolvedValue({});
    prisma.restaurantItemEvent.createMany.mockResolvedValue({ count: 1 });
    prisma.restaurantOrder.update.mockResolvedValue({});

    await service.correctGuestOrder("secret", {
      orderId: "order-latest",
      requestId: "870a42c2-e90f-4ca1-93ae-7ba8972ca17f",
      items: [{ menuItemId: itemId, quantity: 2 }],
    });

    expect(prisma.restaurantOrderItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["old-item"] }, status: "RECEIVED" },
      data: {
        status: "CANCELLED",
        cancelledByGuestCorrection: true,
      },
    });
    expect(prisma.restaurantItemEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          itemId: "old-item",
          note: "Cancelado por corrección del cliente",
        }),
      ],
    });
    expect(prisma.restaurantOrderItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: "order-latest",
        menuItemId: itemId,
        quantity: 2,
      }),
    });
    expect(prisma.restaurantOrder.update).toHaveBeenCalledWith({
      where: { id: "order-latest" },
      data: expect.objectContaining({
        correctionCount: { increment: 1 },
        lastCorrectionRequestId: "870a42c2-e90f-4ca1-93ae-7ba8972ca17f",
      }),
    });
  });

  it("rejects guest correction after its configured deadline", async () => {
    const { prisma, service } = createService();
    prisma.restaurantVisit.findUnique.mockResolvedValue({
      id: "visit-a",
      organizationId: "org-a",
      status: "OPEN",
      occupiesTable: true,
      organization: { restaurantOrderCorrectionMinutes: 2 },
      table: { kind: "DINING" },
      orders: [
        {
          id: "order-latest",
          createdAt: new Date(Date.now() - 121_000),
          items: [
            { id: "old-item", status: "RECEIVED", menuItemId: itemId },
          ],
        },
      ],
    });

    await expect(
      service.correctGuestOrder("secret", {
        orderId: "order-latest",
        requestId: "a768fecd-c5ae-44a1-b5d7-2b51fbb3c2e1",
        items: [{ menuItemId: itemId, quantity: 1 }],
      }),
    ).rejects.toThrow("El tiempo para corregir el pedido ya terminó");
    expect(prisma.restaurantOrderItem.updateMany).not.toHaveBeenCalled();
  });

  it("rolls back correction when staff accepts an item concurrently", async () => {
    const { prisma, service } = createService();
    const currentOrder = {
      id: "order-latest",
      visitId: "visit-a",
      createdAt: new Date(),
      fulfillment: "DINE_IN",
      promotionId: null,
      lastCorrectionRequestId: null,
      items: [
        {
          id: "old-item",
          menuItemId: itemId,
          status: "RECEIVED",
          fulfillment: "DINE_IN",
        },
      ],
    };
    prisma.restaurantVisit.findUnique.mockResolvedValue({
      id: "visit-a",
      organizationId: "org-a",
      status: "OPEN",
      occupiesTable: true,
      organization: { restaurantOrderCorrectionMinutes: 2 },
      table: { kind: "DINING" },
      orders: [currentOrder],
    });
    prisma.restaurantOrder.findFirst.mockResolvedValue(currentOrder);
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.correctGuestOrder("secret", {
        orderId: "order-latest",
        requestId: "be4fbd88-bab2-4cd9-a7f4-70b9f6a0ff6b",
        items: [{ menuItemId: itemId, quantity: 1 }],
      }),
    ).rejects.toThrow("fue aceptado mientras se corregía");
    expect(prisma.restaurantOrderItem.create).not.toHaveBeenCalled();
  });

  it("lets the responsible employee replace an order before preparation", async () => {
    const { prisma, service } = createService();
    const currentOrder = {
      id: "order-staff",
      visitId: "visit-a",
      fulfillment: "DINE_IN",
      promotionId: null,
      correctionCount: 0,
      lastCorrectionRequestId: null,
      table: { waiterId: waiterActor.id, kind: "DINING" },
      visit: {
        id: "visit-a",
        status: "OPEN",
        responsibleStaffId: waiterActor.id,
      },
      items: [
        {
          id: "old-item",
          menuItemId: itemId,
          status: "ACCEPTED",
          fulfillment: "DINE_IN",
        },
      ],
    };
    prisma.restaurantOrder.findFirst.mockResolvedValue(currentOrder);
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.restaurantItemEvent.createMany.mockResolvedValue({ count: 1 });
    prisma.restaurantOrderItem.create.mockResolvedValue({});
    prisma.restaurantOrder.update.mockResolvedValue({
      id: "order-staff",
      correctionCount: 1,
    });

    await service.correctStaffOrder(waiterActor, "order-staff", {
      requestId: "581c2054-59ac-4cec-829f-682994d78454",
      reason: "El cliente cambió la bebida",
      items: [{ menuItemId: itemId, quantity: 2 }],
    });

    expect(prisma.restaurantOrderItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["old-item"] },
        status: { in: ["RECEIVED", "ACCEPTED"] },
      },
      data: {
        status: "CANCELLED",
        cancelledByGuestCorrection: true,
      },
    });
    expect(prisma.restaurantItemEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          actorId: waiterActor.id,
          note: expect.stringContaining("El cliente cambió la bebida"),
        }),
      ],
    });
    expect(prisma.restaurantOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          correctionCount: { increment: 1 },
        }),
      }),
    );
  });

  it("lets the responsible bartender change product, quantity and fulfillment", async () => {
    const { prisma, service } = createService();
    const bartender = { ...waiterActor, restaurantRole: RestaurantStaffRole.BAR };
    const current = {
      id: "bar-order", visitId: "visit-a", fulfillment: "DINE_IN",
      promotionId: null, correctionCount: 0, lastCorrectionRequestId: null,
      table: { waiterId: null, kind: "BAR_SEAT" },
      visit: { id: "visit-a", status: "OPEN", responsibleStaffId: bartender.id },
      items: [{ id: "old", menuItemId: "old-product", status: "RECEIVED" }],
    };
    prisma.restaurantOrder.findFirst.mockResolvedValue(current);
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.restaurantOrder.update.mockResolvedValue({ id: current.id, correctionCount: 1 });
    await service.correctStaffOrder(bartender, current.id, {
      requestId, items: [{ menuItemId: itemId, quantity: 3, fulfillment: "TAKEOUT" }],
    });
    expect(prisma.restaurantOrderItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ menuItemId: itemId, quantity: 3, fulfillment: "TAKEOUT" }),
    });
  });

  it("lets the responsible employee correct an already delivered order", async () => {
    const { prisma, service } = createService();
    const current = {
      id: "delivered-order",
      visitId: "visit-a",
      fulfillment: "DINE_IN",
      promotionId: null,
      correctionCount: 0,
      lastCorrectionRequestId: null,
      table: { waiterId: waiterActor.id, kind: "DINING" },
      visit: {
        id: "visit-a",
        status: "OPEN",
        responsibleStaffId: waiterActor.id,
      },
      items: [
        {
          id: "delivered-item",
          menuItemId: "old-product",
          status: "DELIVERED",
          fulfillment: "DINE_IN",
        },
      ],
    };
    prisma.restaurantOrder.findFirst.mockResolvedValue(current);
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.restaurantOrder.update.mockResolvedValue({
      id: current.id,
      correctionCount: 1,
    });

    await service.correctStaffOrder(waiterActor, current.id, {
      requestId,
      items: [{ menuItemId: itemId, quantity: 2 }],
    });

    expect(prisma.restaurantOrderItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["delivered-item"] },
        status: { in: ["DELIVERED"] },
      },
      data: {
        status: "CANCELLED",
        cancelledByGuestCorrection: true,
      },
    });
    expect(prisma.restaurantOrderItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        menuItemId: itemId,
        quantity: 2,
        status: "DELIVERED",
        deliveredAt: expect.any(Date),
        events: {
          create: expect.objectContaining({ status: "DELIVERED" }),
        },
      }),
    });
  });

  it("lets the responsible employee remove every item from a delivered order", async () => {
    const { prisma, service } = createService();
    const current = {
      id: "delivered-order",
      visitId: "visit-a",
      fulfillment: "DINE_IN",
      promotionId: null,
      correctionCount: 0,
      lastCorrectionRequestId: null,
      table: { waiterId: waiterActor.id, kind: "DINING" },
      visit: {
        id: "visit-a",
        status: "OPEN",
        responsibleStaffId: waiterActor.id,
      },
      items: [
        {
          id: "delivered-item",
          menuItemId: itemId,
          status: "DELIVERED",
          fulfillment: "DINE_IN",
        },
      ],
    };
    prisma.restaurantOrder.findFirst.mockResolvedValue(current);
    prisma.restaurantMenuItem.findMany.mockResolvedValue([]);
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.restaurantOrder.update.mockResolvedValue({
      id: current.id,
      correctionCount: 1,
    });
    prisma.restaurantInventoryMovement.findMany.mockResolvedValue([
      {
        productId: "ingredient-a",
        quantityDelta: -150,
        unitCost: 4,
      },
    ]);
    prisma.restaurantInventoryProduct.update.mockResolvedValue({});

    await service.correctStaffOrder(waiterActor, current.id, {
      requestId,
      items: [],
    });

    expect(prisma.restaurantOrderItem.create).not.toHaveBeenCalled();
    expect(prisma.restaurantOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          promotionCredit: 0,
          correctionCount: { increment: 1 },
        }),
      }),
    );
    expect(prisma.restaurantInventoryProduct.update).toHaveBeenCalledWith({
      where: { id: "ingredient-a" },
      data: { quantity: { increment: 150 } },
    });
    expect(prisma.restaurantInventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderItemId: "delivered-item",
        productId: "ingredient-a",
        type: "REVERSAL",
        quantityDelta: 150,
      }),
    });
  });

  it("blocks staff correction after preparation begins", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrder.findFirst.mockResolvedValue({
      id: "order-staff",
      visitId: "visit-a",
      correctionCount: 0,
      lastCorrectionRequestId: null,
      table: { waiterId: waiterActor.id, kind: "DINING" },
      visit: {
        id: "visit-a",
        status: "OPEN",
        responsibleStaffId: waiterActor.id,
      },
      items: [{ id: "old-item", status: "PREPARING" }],
    });

    await expect(
      service.correctStaffOrder(waiterActor, "order-staff", {
        requestId: "f1b73563-3fb0-43fa-8fba-d7fb41222a16",
        items: [{ menuItemId: itemId, quantity: 1 }],
      }),
    ).rejects.toThrow("La preparación ya comenzó");
    expect(prisma.restaurantOrderItem.updateMany).not.toHaveBeenCalled();
  });

  it("does not expose a closed receipt after the operational retention window", async () => {
    const { prisma, service } = createService();
    prisma.restaurantVisit.findUnique.mockResolvedValue({
      id: "visit-expired",
      accessCode: "secret",
      status: "CLOSED",
      openedAt: new Date("2026-07-01T12:00:00.000Z"),
      closedAt: new Date("2026-07-01T13:00:00.000Z"),
      organization: {
        name: "Café del Parque",
        restaurantRetentionDays: 30,
      },
      table: { name: "Mesa 1", code: "table-code", waiter: null },
      orders: [],
    });

    await expect(service.guestOrder("secret")).rejects.toThrow(
      "Receipt retention period expired",
    );
  });

  it("accumulates every order in the visit and calculates tax and table service", async () => {
    const { prisma, service } = createService();
    prisma.restaurantVisit.findUnique.mockResolvedValue({
      id: "visit-a",
      accessCode: "secret",
      status: "OPEN",
      openedAt: new Date(),
      table: {
        name: "Mesa 1",
        code: "table-code",
        serviceChargeEnabled: true,
        waiter: { id: "waiter-b", name: "Mesero 2" },
      },
      taxRateBps: 1300,
      taxIncluded: false,
      serviceRateBps: 1000,
      serviceChargeEnabled: true,
      orders: [
        {
          id: "order-1",
          createdAt: new Date(),
          items: [
            {
              id: "one",
              name: "Casado",
              price: 4500,
              quantity: 2,
              status: "DELIVERED",
            },
          ],
        },
        {
          id: "order-2",
          createdAt: new Date(),
          items: [
            {
              id: "two",
              name: "Refresco",
              price: 1500,
              quantity: 1,
              status: "RECEIVED",
            },
            {
              id: "deleted-item",
              name: "Producto eliminado",
              price: 9900,
              quantity: 1,
              status: "CANCELLED",
              cancelledByGuestCorrection: false,
            },
          ],
        },
      ],
    });

    const result = await service.guestOrder("secret");

    expect(result.items).toHaveLength(2);
    expect(result.billing).toEqual(
      expect.objectContaining({
        subtotal: 10500,
        tax: 1365,
        service: 1050,
        total: 12915,
      }),
    );
  });

  it("omits tax from the total when the configured rate is zero", async () => {
    const { prisma, service } = createService();
    prisma.restaurantVisit.findUnique.mockResolvedValue({
      id: "visit-a",
      accessCode: "secret",
      status: "OPEN",
      openedAt: new Date(),
      table: {
        name: "Mesa 1",
        code: "table-code",
        serviceChargeEnabled: true,
        waiter: { id: "waiter-b", name: "Mesero 2" },
      },
      taxRateBps: 0,
      taxIncluded: false,
      serviceRateBps: 1000,
      serviceChargeEnabled: true,
      orders: [
        {
          id: "order-1",
          createdAt: new Date(),
          items: [
            {
              id: "one",
              name: "Casado",
              price: 5000,
              quantity: 1,
              status: "DELIVERED",
            },
          ],
        },
      ],
    });

    const result = await service.guestOrder("secret");

    expect(result.billing).toEqual(
      expect.objectContaining({
        subtotal: 5000,
        taxRateBps: 0,
        tax: 0,
        service: 500,
        total: 5500,
      }),
    );
  });

  it("subtracts promotional credit before tax and service", async () => {
    const { prisma, service } = createService();
    prisma.restaurantVisit.findUnique.mockResolvedValue({
      id: "visit-a",
      accessCode: "secret",
      status: "OPEN",
      openedAt: new Date(),
      invoiceRequestStatus: "NOT_REQUESTED",
      table: {
        name: "Mesa 1",
        code: "table-code",
        serviceChargeEnabled: true,
        waiter: null,
      },
      taxRateBps: 1300,
      taxIncluded: false,
      serviceRateBps: 1000,
      serviceChargeEnabled: true,
      orders: [
        {
          id: "order-1",
          createdAt: new Date(),
          promotionCredit: 1000,
          items: [
            {
              id: "one",
              name: "Casado",
              price: 5000,
              quantity: 1,
              status: "DELIVERED",
            },
          ],
        },
      ],
    });

    const result = await service.guestOrder("secret");

    expect(result.billing).toEqual(
      expect.objectContaining({
        grossSubtotal: 5000,
        promotionCredit: 1000,
        subtotal: 4000,
        tax: 520,
        service: 400,
        total: 4920,
      }),
    );
  });

  it("returns consumption and order time in the waiter's active accounts", async () => {
    const { prisma, service } = createService();
    const orderedAt = new Date("2026-09-24T01:30:00.000Z");
    prisma.restaurantVisit.findMany.mockResolvedValue([
      {
        id: "visit-a",
        openedAt: orderedAt,
        taxRateBps: 1300,
        taxIncluded: false,
        serviceRateBps: 1000,
        serviceChargeEnabled: true,
        table: {
          id: "table-a",
          name: "Mesa 1",
          waiterId: "waiter-a",
          serviceChargeEnabled: true,
        },
        orders: [
          {
            id: "order-a",
            createdAt: orderedAt,
            items: [
              {
                id: "item-a",
                name: "Refresco",
                price: 1500,
                quantity: 2,
                status: "DELIVERED",
              },
            ],
          },
        ],
      },
    ]);
    const waiter = {
      id: "waiter-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };

    const result = await service.visits(waiter);

    expect(result[0].items[0]).toEqual(
      expect.objectContaining({
        name: "Refresco",
        quantity: 2,
        orderId: "order-a",
        orderCreatedAt: orderedAt,
      }),
    );
    expect(result[0].canClose).toBe(true);
  });

  it("moves an active account to a bar seat and removes table service", async () => {
    const { prisma, service } = createService();
    const waiter = {
      id: "waiter-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantVisit.findFirst.mockResolvedValue({
      id: "visit-a",
      organizationId: "org-a",
      tableId: "table-a",
      status: "OPEN",
      table: { id: "table-a", waiterId: "waiter-a" },
    });
    prisma.restaurantTable.findFirst.mockResolvedValue({
      id: "bar-1",
      name: "Barra 1",
      organizationId: "org-a",
      kind: "BAR_SEAT",
      serviceChargeEnabled: false,
      active: true,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: "waiter-a",
      name: "Mesero 1",
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    });
    prisma.user.findMany.mockResolvedValue([
      { id: "bartender-a", name: "Bartender 1" },
    ]);
    prisma.restaurantVisit.update.mockResolvedValue({ id: "visit-a" });

    const result = await service.transferVisit(waiter, "visit-a", "bar-1");

    expect(prisma.restaurantVisit.update).toHaveBeenCalledWith({
      where: { id: "visit-a" },
      data: {
        tableId: "bar-1",
        serviceChargeEnabled: false,
        responsibleStaffId: "bartender-a",
        fallbackStaffId: "waiter-a",
      },
    });
    expect(prisma.restaurantOrder.updateMany).toHaveBeenCalledWith({
      where: { visitId: "visit-a" },
      data: { tableId: "bar-1" },
    });
    expect(prisma.restaurantVisitTransfer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        visitId: "visit-a",
        fromTableId: "table-a",
        toTableId: "bar-1",
        actorId: "waiter-a",
      }),
    });
    expect(result.destination.name).toBe("Barra 1");
  });

  it("assigns the bartender even when the original waiter has a lighter load", async () => {
    const { prisma, service } = createService();
    const waiter = {
      id: "waiter-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantVisit.findFirst.mockResolvedValue({
      id: "visit-a",
      organizationId: "org-a",
      tableId: "table-a",
      status: "OPEN",
      responsibleStaffId: "waiter-a",
      table: { id: "table-a", waiterId: "waiter-a" },
    });
    prisma.restaurantTable.findFirst.mockResolvedValue({
      id: "bar-1",
      name: "Barra 1",
      organizationId: "org-a",
      kind: "BAR_SEAT",
      serviceChargeEnabled: false,
      active: true,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: "waiter-a",
      name: "Mesero 1",
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    });
    prisma.user.findMany.mockResolvedValue([
      { id: "bartender-a", name: "Bartender 1" },
    ]);
    prisma.restaurantVisit.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    prisma.restaurantVisit.update.mockResolvedValue({ id: "visit-a" });

    await service.transferVisit(waiter, "visit-a", "bar-1");

    expect(prisma.restaurantVisit.update).toHaveBeenCalledWith({
      where: { id: "visit-a" },
      data: expect.objectContaining({
        responsibleStaffId: "bartender-a",
        fallbackStaffId: "waiter-a",
        serviceChargeEnabled: false,
      }),
    });
  });

  it("blocks a waiter from moving an account to an unattended bar", async () => {
    const { prisma, service } = createService();
    const waiter = {
      id: "waiter-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantVisit.findFirst.mockResolvedValue({
      id: "visit-a",
      organizationId: "org-a",
      tableId: "table-a",
      status: "OPEN",
      responsibleStaffId: "waiter-a",
      table: { id: "table-a", waiterId: "waiter-a" },
    });
    prisma.restaurantTable.findFirst.mockResolvedValue({
      id: "bar-1",
      name: "Barra 1",
      organizationId: "org-a",
      kind: "BAR_SEAT",
      serviceChargeEnabled: false,
      active: true,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: "waiter-a",
      name: "Mesero 1",
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    });
    prisma.user.findMany.mockResolvedValue([]);

    await expect(
      service.transferVisit(waiter, "visit-a", "bar-1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.restaurantVisit.update).not.toHaveBeenCalled();
  });

  it("allows the responsible bartender to close a fully delivered account", async () => {
    const { prisma, service } = createService();
    const bartender = {
      id: "bartender-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.BAR,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantVisit.findFirst.mockResolvedValue({
      id: "visit-a",
      organizationId: "org-a",
      responsibleStaffId: "bartender-a",
      responsibleStaff: {
        id: "bartender-a",
        restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
      },
      table: { waiterId: null },
      orders: [{ items: [{ status: "DELIVERED" }] }],
    });
    prisma.restaurantVisit.update.mockResolvedValue({
      id: "visit-a",
      status: "CLOSED",
    });

    await service.closeVisit(bartender, "visit-a");

    expect(prisma.restaurantVisit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "visit-a" },
        data: expect.objectContaining({
          status: "CLOSED",
          closedAt: expect.any(Date),
          closedById: "bartender-a",
          closedByRole: RestaurantStaffRole.BAR,
          paymentMethod: RestaurantPaymentMethod.CASH,
          receiptNumber: expect.stringMatching(/^AT-/),
        }),
      }),
    );
  });

  it("returns the existing order when the same request is retried", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrder.findUnique.mockResolvedValue(order);
    expect(await service.placeOrder("table-code", payload)).toEqual(order);
    expect(prisma.restaurantOrder.create).not.toHaveBeenCalled();
  });

  it("rejects reused request IDs from a different table", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrder.findUnique.mockResolvedValue({
      ...order,
      tableId: "other",
    });
    await expect(
      service.placeOrder("table-code", payload),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects unavailable or cross-organization menu items", async () => {
    const { prisma, service } = createService();
    prisma.restaurantMenuItem.findMany.mockResolvedValue([]);
    await expect(
      service.placeOrder("table-code", payload),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.restaurantOrder.create).not.toHaveBeenCalled();
  });

  it("prevents updates to another restaurant's order items", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue(null);
    await expect(
      service.updateStatus(kitchenActor, "item", { status: "ACCEPTED" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.restaurantOrderItem.findFirst).toHaveBeenCalledWith({
      where: { id: "item", order: { organizationId: "org-a" } },
      include: {
        order: {
          select: {
            table: { select: { waiterId: true } },
            visit: { select: { responsibleStaffId: true, status: true, paymentStatus: true } },
          },
        },
      },
    });
  });

  it("records a valid transition and refuses to skip steps", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      status: "RECEIVED",
      station: "KITCHEN",
      order: { table: { waiterId: null } },
    });
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.updateStatus(kitchenActor, "item", { status: "READY" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.updateStatus(kitchenActor, "item", {
      status: "ACCEPTED",
    });
    expect(prisma.restaurantItemEvent.create).toHaveBeenCalledWith({
      data: { itemId: "item", actorId: "staff", status: "ACCEPTED" },
    });
  });

  it("prevents kitchen staff from changing bar items", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      status: "RECEIVED",
      station: "BAR",
      order: { table: { waiterId: null } },
    });
    await expect(
      service.updateStatus(kitchenActor, "item", { status: "ACCEPTED" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.restaurantOrderItem.updateMany).not.toHaveBeenCalled();
  });

  it("filters the kitchen queue at the database boundary", async () => {
    const { prisma, service } = createService();
    await service.orders(kitchenActor);
    expect(prisma.restaurantOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-a",
          items: {
            some: expect.objectContaining({ station: "KITCHEN" }),
          },
        }),
        include: expect.objectContaining({
          items: expect.objectContaining({
            where: expect.objectContaining({ station: "KITCHEN" }),
          }),
        }),
      }),
    );
  });

  it.each([RestaurantStaffRole.WAITER, RestaurantStaffRole.BAR])(
    "lets the responsible %s deliver directly from received",
    async (role) => {
      const { prisma, service } = createService();
      prisma.restaurantOrderItem.findFirst.mockResolvedValue({
        status: "RECEIVED", station: "KITCHEN", handedOffAt: null,
        order: { table: { waiterId: null }, visit: {
          responsibleStaffId: waiterActor.id, status: "OPEN", paymentStatus: "NOT_REQUIRED",
        } },
      });
      prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
      await service.updateStatus({ ...waiterActor, restaurantRole: role }, "item", { status: "DELIVERED" });
      expect(prisma.restaurantOrderItem.updateMany).toHaveBeenCalledWith({
        where: { id: "item", status: "RECEIVED" },
        data: { status: "DELIVERED", deliveredAt: expect.any(Date) },
      });
      await expect(service.updateStatus({ ...waiterActor, id: "other", restaurantRole: role }, "item", {
        status: "DELIVERED",
      })).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it("discounts every recipe ingredient exactly when an item is delivered", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      id: "order-item-a",
      menuItemId: itemId,
      name: "Pizza",
      quantity: 2,
      status: "RECEIVED",
      station: "KITCHEN",
      order: {
        table: { waiterId: null },
        visit: {
          responsibleStaffId: waiterActor.id,
          status: "OPEN",
          paymentStatus: "NOT_REQUIRED",
        },
      },
    });
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.restaurantRecipeIngredient.findMany.mockResolvedValue([
      {
        productId: "cheese-a",
        quantityPerMenuItem: 125,
        product: {
          id: "cheese-a",
          name: "Queso",
          quantity: 1000,
          unitCost: 4,
          active: true,
        },
      },
    ]);
    prisma.restaurantInventoryProduct.updateMany.mockResolvedValue({ count: 1 });

    await service.updateStatus(waiterActor, "order-item-a", {
      status: "DELIVERED",
    });

    expect(prisma.restaurantInventoryProduct.updateMany).toHaveBeenCalledWith({
      where: {
        id: "cheese-a",
        organizationId: "org-a",
        active: true,
        quantity: { gte: 250 },
      },
      data: { quantity: { decrement: 250 } },
    });
    expect(prisma.restaurantInventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "cheese-a",
        orderItemId: "order-item-a",
        type: "CONSUMPTION",
        quantityDelta: -250,
      }),
    });
    expect(prisma.restaurantInventoryProduct.findFirst).not.toHaveBeenCalled();
  });

  it("discounts a directly linked unit product one-to-one when no recipe exists", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      id: "order-item-beer",
      menuItemId: itemId,
      name: "Imperial regular",
      quantity: 3,
      status: "RECEIVED",
      station: "BAR",
      order: {
        table: { waiterId: null },
        visit: {
          responsibleStaffId: waiterActor.id,
          status: "OPEN",
          paymentStatus: "NOT_REQUIRED",
        },
      },
    });
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.restaurantRecipeIngredient.findMany.mockResolvedValue([]);
    prisma.restaurantInventoryProduct.findFirst.mockResolvedValue({
      id: "imperial-stock",
      name: "Imperial regular",
      quantity: 122,
      unitCost: 700,
      active: true,
    });
    prisma.restaurantInventoryProduct.updateMany.mockResolvedValue({ count: 1 });

    await service.updateStatus(waiterActor, "order-item-beer", {
      status: "DELIVERED",
    });

    expect(prisma.restaurantInventoryProduct.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org-a",
        menuItemId: itemId,
        stockUnit: "UNIT",
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        unitCost: true,
        active: true,
      },
    });
    expect(prisma.restaurantInventoryProduct.updateMany).toHaveBeenCalledWith({
      where: {
        id: "imperial-stock",
        organizationId: "org-a",
        active: true,
        quantity: { gte: 3 },
      },
      data: { quantity: { decrement: 3 } },
    });
    expect(prisma.restaurantInventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "imperial-stock",
        orderItemId: "order-item-beer",
        type: "CONSUMPTION",
        quantityDelta: -3,
        note: "Consumo automático: 3 × Imperial regular",
      }),
    });
  });

  it("blocks delivery when a recipe ingredient has insufficient inventory", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      id: "order-item-a",
      menuItemId: itemId,
      name: "Pizza",
      quantity: 2,
      status: "RECEIVED",
      station: "KITCHEN",
      order: {
        table: { waiterId: null },
        visit: {
          responsibleStaffId: waiterActor.id,
          status: "OPEN",
          paymentStatus: "NOT_REQUIRED",
        },
      },
    });
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.restaurantRecipeIngredient.findMany.mockResolvedValue([
      {
        productId: "cheese-a",
        quantityPerMenuItem: 125,
        product: {
          id: "cheese-a",
          name: "Queso",
          quantity: 100,
          unitCost: 4,
          active: true,
        },
      },
    ]);
    prisma.restaurantInventoryProduct.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateStatus(waiterActor, "order-item-a", {
        status: "DELIVERED",
      }),
    ).rejects.toThrow("Inventario insuficiente de Queso");
    expect(prisma.restaurantInventoryMovement.create).not.toHaveBeenCalled();
  });

  it("blocks direct delivery until payment is confirmed", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      status: "RECEIVED", station: "BAR",
      order: { table: { waiterId: null }, visit: {
        responsibleStaffId: waiterActor.id, status: "OPEN", paymentStatus: "PENDING",
      } },
    });
    await expect(service.updateStatus(waiterActor, "item", { status: "DELIVERED" }))
      .rejects.toThrow("Confirme el pago");
    expect(prisma.restaurantOrderItem.updateMany).not.toHaveBeenCalled();
  });

  it("allows only the assigned waiter to deliver ready items", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      status: "READY",
      station: "BAR",
      handedOffAt: new Date("2026-09-25T12:00:00.000Z"),
      order: { table: { waiterId: "waiter-a" } },
    });
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    const waiter = {
      id: "waiter-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    await service.updateStatus(waiter, "item", { status: "DELIVERED" });
    await expect(
      service.updateStatus({ ...waiter, id: "waiter-b" }, "item", {
        status: "DELIVERED",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("records when the responsible waiter receives a ready item", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      id: "item-a",
      status: "READY",
      handedOffAt: null,
      order: {
        table: { waiterId: "waiter-a" },
        visit: { responsibleStaffId: "waiter-a" },
      },
    });
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.restaurantOrderItem.findUnique.mockResolvedValue({
      id: "item-a",
      handedOffAt: new Date(),
    });
    const waiter = {
      id: "waiter-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };

    await service.handoffItem(waiter, "item-a");

    expect(prisma.restaurantOrderItem.updateMany).toHaveBeenCalledWith({
      where: { id: "item-a", status: "READY", handedOffAt: null },
      data: { handedOffAt: expect.any(Date) },
    });
    expect(prisma.restaurantItemEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: "item-a",
        actorId: "waiter-a",
        note: "HANDOFF_CONFIRMED",
      }),
    });
  });

  it("blocks status changes while a staff member is unavailable", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      status: "RECEIVED",
      station: "KITCHEN",
      order: { table: { waiterId: null } },
    });
    await expect(
      service.updateStatus(
        {
          ...kitchenActor,
          restaurantAvailability:
            RestaurantStaffAvailability.TEMPORARILY_UNAVAILABLE,
        },
        "item",
        { status: "ACCEPTED" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("calculates active and unavailable staff time inside a date range", async () => {
    const { prisma, service } = createService();
    prisma.organizationLocation.findFirst.mockResolvedValue({
      timezone: "UTC",
    });
    prisma.restaurantStaffSession.findMany.mockResolvedValue([
      {
        id: "session-a",
        organizationId: "org-a",
        userId: "waiter-a",
        initialAvailability: RestaurantStaffAvailability.AVAILABLE,
        startedAt: new Date("2026-09-27T08:00:00.000Z"),
        lastSeenAt: new Date("2026-09-27T17:00:00.000Z"),
        endedAt: new Date("2026-09-27T17:00:00.000Z"),
        user: {
          id: "waiter-a",
          name: "Mesero 1",
          email: "mesero1@example.com",
          restaurantRole: RestaurantStaffRole.WAITER,
          role: UserRole.USER,
          restaurantPayPeriod: RestaurantPayPeriod.HOURLY,
          restaurantPayRate: 2000,
          restaurantStandardMinutesPerDay: 480,
          restaurantWorkDaysPerMonth: 26,
          restaurantCcssDeductionEnabled: true,
          restaurantCcssDeductionBps: 1000,
        },
      },
    ]);
    prisma.restaurantStaffEvent.findMany.mockResolvedValue([
      {
        userId: "waiter-a",
        availability: RestaurantStaffAvailability.BREAK,
        reason: "Almuerzo",
        createdAt: new Date("2026-09-27T12:00:00.000Z"),
      },
      {
        userId: "waiter-a",
        availability: RestaurantStaffAvailability.AVAILABLE,
        reason: "Regreso",
        createdAt: new Date("2026-09-27T13:00:00.000Z"),
      },
      {
        userId: "waiter-a",
        availability: RestaurantStaffAvailability.TEMPORARILY_UNAVAILABLE,
        reason: "Gestión personal",
        createdAt: new Date("2026-09-27T15:00:00.000Z"),
      },
      {
        userId: "waiter-a",
        availability: RestaurantStaffAvailability.AVAILABLE,
        reason: "Regreso",
        createdAt: new Date("2026-09-27T15:30:00.000Z"),
      },
    ]);

    const result = await service.staffHours(
      {
        id: "admin-a",
        organizationId: "org-a",
        role: UserRole.ADMIN,
        restaurantRole: RestaurantStaffRole.RESTAURANT_ADMIN,
        restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
      },
      "2026-09-27",
      "2026-09-27",
      "waiter-a",
    );

    expect(result.summary).toEqual(
      expect.objectContaining({
        employees: 1,
        sessions: 1,
        activeMs: 7.5 * 60 * 60 * 1000,
        outOfServiceMs: 1.5 * 60 * 60 * 1000,
        payableMs: 8.5 * 60 * 60 * 1000,
        deductedMs: 0.5 * 60 * 60 * 1000,
        grossPay: 17000,
        ccssDeduction: 1700,
        netPay: 15300,
      }),
    );
    expect(result.employees[0]).toEqual(
      expect.objectContaining({
        name: "Mesero 1",
        activeMs: 7.5 * 60 * 60 * 1000,
        breakMs: 60 * 60 * 1000,
        temporarilyUnavailableMs: 30 * 60 * 1000,
        payroll: expect.objectContaining({
          payableMs: 8.5 * 60 * 60 * 1000,
          deductedMs: 30 * 60 * 1000,
          grossPay: 17000,
          ccssDeduction: 1700,
          netPay: 15300,
        }),
      }),
    );
    expect(result.sessions[0]).toEqual(
      expect.objectContaining({
        entryAt: new Date("2026-09-27T08:00:00.000Z"),
        exitAt: new Date("2026-09-27T17:00:00.000Z"),
        status: "CLOSED",
      }),
    );
  });

  it("prorates daily and monthly salaries from payable hours", async () => {
    const { prisma, service } = createService();
    prisma.organizationLocation.findFirst.mockResolvedValue({
      timezone: "UTC",
    });
    const session = (
      id: string,
      userId: string,
      name: string,
      payPeriod: RestaurantPayPeriod,
      payRate: number,
    ) => ({
      id,
      organizationId: "org-a",
      userId,
      initialAvailability: RestaurantStaffAvailability.AVAILABLE,
      startedAt: new Date("2026-09-27T08:00:00.000Z"),
      lastSeenAt: new Date("2026-09-27T16:00:00.000Z"),
      endedAt: new Date("2026-09-27T16:00:00.000Z"),
      user: {
        id: userId,
        name,
        email: `${userId}@example.com`,
        restaurantRole: RestaurantStaffRole.WAITER,
        role: UserRole.USER,
        restaurantPayPeriod: payPeriod,
        restaurantPayRate: payRate,
        restaurantStandardMinutesPerDay: 480,
        restaurantWorkDaysPerMonth: 26,
        restaurantCcssDeductionEnabled: false,
        restaurantCcssDeductionBps: 0,
      },
    });
    prisma.restaurantStaffSession.findMany.mockResolvedValue([
      session(
        "session-daily",
        "waiter-daily",
        "Mesero diario",
        RestaurantPayPeriod.DAILY,
        16000,
      ),
      session(
        "session-monthly",
        "waiter-monthly",
        "Mesero mensual",
        RestaurantPayPeriod.MONTHLY,
        520000,
      ),
    ]);

    const result = await service.staffHours(
      {
        id: "admin-a",
        organizationId: "org-a",
        role: UserRole.ADMIN,
        restaurantRole: RestaurantStaffRole.RESTAURANT_ADMIN,
        restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
      },
      "2026-09-27",
      "2026-09-27",
    );

    expect(result.summary.grossPay).toBe(36000);
    expect(
      result.employees.find((employee) => employee.userId === "waiter-daily")
        ?.payroll.grossPay,
    ).toBe(16000);
    expect(
      result.employees.find((employee) => employee.userId === "waiter-monthly")
        ?.payroll.grossPay,
    ).toBe(20000);
  });

  it("updates payroll settings only for staff in the administrator organization", async () => {
    const { prisma, service } = createService();
    prisma.user.findFirst.mockResolvedValue({ id: "waiter-a" });
    prisma.user.update.mockResolvedValue({
      id: "waiter-a",
      restaurantPayPeriod: RestaurantPayPeriod.DAILY,
      restaurantPayRate: 18000,
    });

    await service.updateStaffPayroll(
      {
        id: "admin-a",
        organizationId: "org-a",
        role: UserRole.ADMIN,
        restaurantRole: RestaurantStaffRole.RESTAURANT_ADMIN,
        restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
      },
      "waiter-a",
      {
        payPeriod: RestaurantPayPeriod.DAILY,
        payRate: 18000,
        standardMinutesPerDay: 480,
        workDaysPerMonth: 26,
        ccssDeductionEnabled: true,
        ccssDeductionBps: 1083,
      },
    );

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "waiter-a", organizationId: "org-a", active: true },
      select: { id: true },
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "waiter-a" },
        data: expect.objectContaining({
          restaurantPayPeriod: RestaurantPayPeriod.DAILY,
          restaurantPayRate: 18000,
          restaurantCcssDeductionEnabled: true,
          restaurantCcssDeductionBps: 1083,
        }),
      }),
    );
  });

  it("automatically balances a waiter's active tables when going unavailable", async () => {
    const { prisma, service } = createService();
    const waiter = {
      id: "waiter-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.user.findFirst.mockResolvedValue({
      id: waiter.id,
      restaurantRole: RestaurantStaffRole.WAITER,
    });
    prisma.user.update.mockResolvedValue({
      id: waiter.id,
      name: "Mesero 1",
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.BREAK,
    });
    prisma.restaurantTable.findMany.mockResolvedValue([
      { id: "table-1", name: "Mesa 1" },
      { id: "table-2", name: "Mesa 2" },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: "waiter-b", name: "Mesero 2", restaurantTables: [] },
      {
        id: "waiter-c",
        name: "Mesero 3",
        restaurantTables: [{ id: "table-existing" }],
      },
    ]);
    prisma.restaurantTable.update.mockResolvedValue({});

    const result = await service.updateOwnStaffAvailability(waiter, {
      availability: RestaurantStaffAvailability.BREAK,
      reason: "Descanso programado",
    });

    expect(result.reassignments).toEqual([
      expect.objectContaining({ tableId: "table-1", waiterId: "waiter-b" }),
      expect.objectContaining({ tableId: "table-2", waiterId: "waiter-c" }),
    ]);
    expect(prisma.restaurantTable.update).toHaveBeenNthCalledWith(1, {
      where: { id: "table-1" },
      data: { waiterId: "waiter-b" },
    });
    expect(prisma.restaurantStaffEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "waiter-a",
        actorId: "waiter-a",
        availability: RestaurantStaffAvailability.BREAK,
      }),
    });
  });

  it("blocks staff from leaving availability while responsible for an open cash session", async () => {
    const { prisma, service } = createService();
    prisma.restaurantCashSession.findFirst.mockResolvedValue({
      id: "cash-session-a",
      cashRegister: { name: "Caja principal" },
    });

    await expect(
      service.updateOwnStaffAvailability(waiterActor, {
        availability: RestaurantStaffAvailability.BREAK,
        reason: "Descanso programado",
      }),
    ).rejects.toThrow(
      "Debe entregar o cerrar Caja principal antes de cambiar la disponibilidad",
    );

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.restaurantStaffEvent.create).not.toHaveBeenCalled();
  });

  it("blocks staff from becoming available outside the restaurant geofence", async () => {
    const { prisma, service } = createService();
    const waiter = {
      id: "waiter-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability:
        RestaurantStaffAvailability.TEMPORARILY_UNAVAILABLE,
    };
    prisma.organization.findUnique.mockResolvedValue({
      restaurantLatitude: 9.9281,
      restaurantLongitude: -84.0907,
      restaurantOrderRadiusMeters: 100,
    });

    await expect(
      service.updateOwnStaffAvailability(waiter, {
        availability: RestaurantStaffAvailability.AVAILABLE,
        latitude: 10,
        longitude: -84.2,
        locationAccuracy: 5,
      }),
    ).rejects.toThrow("Estás fuera del alcance del local comercial");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.restaurantStaffEvent.create).not.toHaveBeenCalled();
  });

  it("reports tables that cannot be reassigned to an available waiter", async () => {
    const { prisma, service } = createService();
    const waiter = {
      id: "waiter-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.user.findFirst.mockResolvedValue({
      id: waiter.id,
      restaurantRole: RestaurantStaffRole.WAITER,
    });
    prisma.user.update.mockResolvedValue({
      id: waiter.id,
      name: "Mesero 1",
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability:
        RestaurantStaffAvailability.TEMPORARILY_UNAVAILABLE,
    });
    prisma.restaurantTable.findMany.mockResolvedValue([
      { id: "table-1", name: "Mesa 1" },
    ]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.restaurantTable.update.mockResolvedValue({});

    const result = await service.updateOwnStaffAvailability(waiter, {
      availability: RestaurantStaffAvailability.TEMPORARILY_UNAVAILABLE,
      reason: "Emergencia",
    });

    expect(result.reassignments).toEqual([]);
    expect(result.unassignedTables).toEqual([
      { id: "table-1", name: "Mesa 1" },
    ]);
    expect(prisma.restaurantTable.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["table-1"] } },
      data: { waiterId: null },
    });
  });

  it("records a delivery-mode correction without requiring a private reason", async () => {
    const { prisma, service } = createService();
    const waiter = {
      id: "waiter-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.WAITER,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      id: itemId,
      status: "PREPARING",
      fulfillment: "TAKEOUT",
      order: { table: { waiterId: waiter.id } },
    });
    prisma.restaurantOrderItem.update.mockResolvedValue({
      id: itemId,
      fulfillment: "DINE_IN",
    });

    await service.updateItemFulfillment(waiter, itemId, {
      fulfillment: "DINE_IN",
    });

    expect(prisma.restaurantItemEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: waiter.id,
        note: "Fulfillment corrected from TAKEOUT to DINE_IN",
      }),
    });
  });

  it("deletes only menu products without order history", async () => {
    const { prisma, service } = createService();
    const admin = {
      id: "admin-a",
      organizationId: "org-a",
      role: UserRole.ADMIN,
      restaurantRole: null,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantMenuItem.findFirst.mockResolvedValue({ id: itemId });
    prisma.restaurantOrderItem.count.mockResolvedValue(0);

    await expect(service.deleteMenuItem(admin, itemId)).resolves.toEqual({
      deleted: true,
    });
    expect(prisma.restaurantMenuItem.delete).toHaveBeenCalledWith({
      where: { id: itemId },
    });

    prisma.restaurantOrderItem.count.mockResolvedValue(1);
    await expect(service.deleteMenuItem(admin, itemId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("reports products at or below their minimum as inventory alerts", async () => {
    const { prisma, service } = createService();
    const admin = {
      id: "admin-a",
      organizationId: "org-a",
      role: UserRole.ADMIN,
      restaurantRole: null,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantInventoryProduct.findMany.mockResolvedValue([
      {
        id: "product-a",
        name: "Agua mineral",
        active: true,
        quantity: 4,
        minimumQuantity: 5,
        presentation: "botella",
        unitCost: 500,
      },
    ]);

    const result = await service.inventory(admin);

    expect(result.alerts).toEqual([
      expect.objectContaining({ productId: "product-a", quantity: 4 }),
    ]);
    expect(result.summary.lowStockProducts).toBe(1);
  });

  it("replaces a menu recipe with validated inventory ingredients", async () => {
    const { prisma, service } = createService();
    const admin = {
      id: "admin-a",
      organizationId: "org-a",
      role: UserRole.ADMIN,
      restaurantRole: null,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantMenuItem.findFirst.mockResolvedValue({
      id: itemId,
      name: "Pizza",
    });
    prisma.restaurantInventoryProduct.findMany.mockResolvedValue([
      { id: "flour-a" },
      { id: "cheese-a" },
    ]);

    await service.saveInventoryRecipe(admin, itemId, {
      ingredients: [
        { productId: "flour-a", quantityPerMenuItem: 180 },
        { productId: "cheese-a", quantityPerMenuItem: 125 },
      ],
    });

    expect(prisma.restaurantRecipeIngredient.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", menuItemId: itemId },
    });
    expect(prisma.restaurantRecipeIngredient.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: "org-a",
          menuItemId: itemId,
          productId: "flour-a",
          quantityPerMenuItem: 180,
        },
        {
          organizationId: "org-a",
          menuItemId: itemId,
          productId: "cheese-a",
          quantityPerMenuItem: 125,
        },
      ],
    });
  });

  it("lets an administrator configure an existing product measurement before automatic consumption", async () => {
    const { prisma, service } = createService();
    const admin = {
      id: "admin-a",
      organizationId: "org-a",
      role: UserRole.ADMIN,
      restaurantRole: null,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantInventoryProduct.findFirst.mockResolvedValue({
      id: "cheese-a",
      organizationId: "org-a",
      stockUnit: "UNIT",
      unitsPerPresentation: 1,
    });

    await service.updateInventoryProduct(admin, "cheese-a", {
      stockUnit: "GRAM",
      unitsPerPresentation: 1000,
    });

    expect(prisma.restaurantInventoryProduct.update).toHaveBeenCalledWith({
      where: { id: "cheese-a" },
      data: expect.objectContaining({
        stockUnit: "GRAM",
        unitsPerPresentation: 1000,
      }),
    });
  });

  it("protects measurement history after an automatic inventory movement", async () => {
    const { prisma, service } = createService();
    const admin = {
      id: "admin-a",
      organizationId: "org-a",
      role: UserRole.ADMIN,
      restaurantRole: null,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantInventoryProduct.findFirst.mockResolvedValue({
      id: "cheese-a",
      organizationId: "org-a",
      stockUnit: "UNIT",
      unitsPerPresentation: 1,
    });
    prisma.restaurantInventoryMovement.findFirst.mockResolvedValue({
      id: "movement-a",
    });

    await expect(
      service.updateInventoryProduct(admin, "cheese-a", {
        stockUnit: "GRAM",
        unitsPerPresentation: 1000,
      }),
    ).rejects.toThrow(
      "La unidad de medida no puede cambiar después de registrar consumos automáticos",
    );
    expect(prisma.restaurantInventoryProduct.update).not.toHaveBeenCalled();
  });

  it("relates a liquor weighing to delivered menu quantities", async () => {
    const { prisma, service } = createService();
    const admin = {
      id: "admin-a",
      organizationId: "org-a",
      role: UserRole.ADMIN,
      restaurantRole: null,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantInventoryProduct.findFirst.mockResolvedValue({
      id: "liquor-a",
      menuItemId: itemId,
      productType: RestaurantInventoryProductType.LIQUOR,
      liquorInitialTareGrams: 400,
    });
    prisma.restaurantLiquorWeighing.findFirst.mockResolvedValue({
      measuredAt: new Date("2026-10-02T12:00:00Z"),
      netWeightGrams: 900,
    });
    prisma.restaurantOrderItem.aggregate.mockResolvedValue({
      _sum: { quantity: 3 },
    });
    prisma.restaurantLiquorWeighing.create.mockImplementation(({ data }) =>
      Promise.resolve(data),
    );

    const result = await service.addLiquorWeighing(admin, "liquor-a", {
      grossWeightGrams: 1100,
      measuredAt: "2026-10-03T12:00:00Z",
    });

    expect(result).toEqual(
      expect.objectContaining({
        netWeightGrams: 700,
        consumedWeightGrams: 200,
        relatedOrderQuantity: 3,
      }),
    );
  });

  it("allows available bar staff to record inventory and change costs", async () => {
    const { prisma, service } = createService();
    const bartender = {
      id: "bar-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.BAR,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    prisma.restaurantInventoryProduct.findFirst.mockResolvedValue({
      id: "product-a",
      quantity: 8,
    });
    prisma.restaurantInventoryProduct.update.mockResolvedValue({});
    prisma.restaurantInventoryMovement.create.mockResolvedValue({
      id: "movement-a",
      quantityDelta: 2,
    });

    await expect(
      service.addInventoryMovement(bartender, "product-a", {
        type: "ENTRY",
        quantityDelta: 2,
      }),
    ).resolves.toEqual(expect.objectContaining({ quantityDelta: 2 }));

    await expect(
      service.addInventoryMovement(bartender, "product-a", {
        type: "ENTRY",
        quantityDelta: 2,
        unitCost: 900,
      }),
    ).resolves.toEqual(expect.objectContaining({ quantityDelta: 2 }));
  });

  it("grants bar staff full inventory catalog permissions", async () => {
    const { prisma, service } = createService();
    const bartender = {
      id: "bar-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.BAR,
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
    };
    const result = await service.inventory(bartender);
    expect(result.permissions).toEqual({
      canManageCatalog: true,
      canRecordMovements: true,
      isBar: true,
    });
    prisma.restaurantInventoryCategory.findFirst.mockResolvedValue(null);
    await service.addInventoryCategory(bartender, { name: "Bebidas" });
    expect(prisma.restaurantInventoryCategory.create).toHaveBeenCalledWith({
      data: { organizationId: "org-a", name: "Bebidas" },
    });
    await expect(service.inventory(kitchenActor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("denies inventory records from bar staff who are out of service", async () => {
    const { service } = createService();
    const bartender = {
      id: "bar-a",
      organizationId: "org-a",
      role: UserRole.USER,
      restaurantRole: RestaurantStaffRole.BAR,
      restaurantAvailability:
        RestaurantStaffAvailability.TEMPORARILY_UNAVAILABLE,
    };

    await expect(
      service.addInventoryMovement(bartender, "product-a", {
        type: "ADJUSTMENT",
        quantityDelta: -1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
