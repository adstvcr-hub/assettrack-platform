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
      findUnique: vi.fn().mockResolvedValue(table),
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
    restaurantVisit: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      findMany: vi.fn(),
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
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(order),
    },
    restaurantOrderItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    restaurantItemEvent: { create: vi.fn() },
    restaurantStaffEvent: { create: vi.fn() },
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

  it("shows only the assigned waiter's identity to a guest", async () => {
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
      orders: [],
    });

    const result = await service.guestOrder("secret");

    expect(result.table.waiter).toEqual({
      id: "waiter-b",
      name: "Mesero 2",
    });
    expect(prisma.restaurantVisit.findUnique).toHaveBeenCalledWith({
      where: { accessCode: "secret" },
      include: expect.objectContaining({
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
        order: { select: { table: { select: { waiterId: true } } } },
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
          items: {
            where: expect.objectContaining({ station: "KITCHEN" }),
          },
        }),
      }),
    );
  });

  it("allows only the assigned waiter to deliver ready items", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      status: "READY",
      station: "BAR",
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
});
