import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { RestaurantService } from "./restaurant.service";

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
function createService() {
  const prisma = {
    restaurantTable: { findUnique: vi.fn().mockResolvedValue(table) },
    restaurantMenuItem: { findMany: vi.fn().mockResolvedValue([menuItem]) },
    restaurantOrder: {
      findUnique: vi.fn().mockResolvedValue(null),
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
      service.updateStatus("org-a", "staff", "item", { status: "ACCEPTED" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.restaurantOrderItem.findFirst).toHaveBeenCalledWith({
      where: { id: "item", order: { organizationId: "org-a" } },
    });
  });

  it("records a valid transition and refuses to skip steps", async () => {
    const { prisma, service } = createService();
    prisma.restaurantOrderItem.findFirst.mockResolvedValue({
      status: "RECEIVED",
    });
    prisma.restaurantOrderItem.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.updateStatus("org-a", "staff", "item", { status: "READY" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.updateStatus("org-a", "staff", "item", {
      status: "ACCEPTED",
    });
    expect(prisma.restaurantItemEvent.create).toHaveBeenCalledWith({
      data: { itemId: "item", actorId: "staff", status: "ACCEPTED" },
    });
  });
});
