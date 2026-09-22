import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { RestaurantService } from "./restaurant.service";
import { RestaurantStaffRole, UserRole } from "../generated/prisma/enums";

const table = { id: "table-a", organizationId: "org-a", active: true };
const requestId = "995bb3ed-a5c4-405e-bc8a-c2b4f360853a";
const itemId = "0696245b-f10d-4faf-8445-2e21d3336faf";
const order = { id: "order-a", tableId: table.id, accessCode: "secret" };
const menuItem = {
  id: itemId,
  name: "Coffee",
  price: 1200,
  station: "BAR",
  course: "DRINK",
};
const kitchenActor = {
  id: "staff",
  organizationId: "org-a",
  role: UserRole.USER,
  restaurantRole: RestaurantStaffRole.KITCHEN,
};
function createService() {
  const prisma = {
    restaurantTable: { findUnique: vi.fn().mockResolvedValue(table) },
    restaurantMenuItem: { findMany: vi.fn().mockResolvedValue([menuItem]) },
    restaurantOrder: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(order),
    },
    restaurantOrderItem: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    restaurantItemEvent: { create: vi.fn() },
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
      where: { id: { in: [itemId] }, organizationId: "org-a", active: true },
    });
    expect(prisma.restaurantOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-a",
          tableId: "table-a",
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

  it("returns the existing order when the same request is retried", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrder.findUnique.mockResolvedValue(order);
    expect(await service.placeOrder("table-code", payload)).toBe(order);
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
    };
    await service.updateStatus(waiter, "item", { status: "DELIVERED" });
    await expect(
      service.updateStatus({ ...waiter, id: "waiter-b" }, "item", {
        status: "DELIVERED",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
