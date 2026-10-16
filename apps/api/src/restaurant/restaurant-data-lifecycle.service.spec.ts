import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { RestaurantDataLifecycleService } from "./restaurant-data-lifecycle.service";

function createService() {
  const prisma = {
    organization: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "org-a", restaurantRetentionDays: 30 }]),
    },
    restaurantQrAccess: {
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
    restaurantVisit: {
      findMany: vi.fn().mockResolvedValue([{ id: "visit-expired" }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    restaurantOrder: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    platformAdminEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const service = new RestaurantDataLifecycleService(
    prisma as unknown as PrismaService,
  );
  return { prisma, service };
}

describe("RestaurantDataLifecycleService", () => {
  it("generates a stable public receipt reference without exposing access codes", () => {
    const { service } = createService();
    expect(
      service.receiptNumber(
        "0696245b-f10d-4faf-8445-2e21d3336faf",
        new Date("2026-09-27T18:00:00.000Z"),
      ),
    ).toBe("AT-20260927-0696245BF10D4FAF");
  });

  it("consolidates first and only deletes expired records already consolidated", async () => {
    const { prisma, service } = createService();
    vi.spyOn(service, "consolidatePending").mockResolvedValue(7);

    const result = await service.runMaintenance("org-a");

    expect(service.consolidatePending).toHaveBeenCalledWith("org-a");
    expect(prisma.restaurantQrAccess.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: "org-a",
        createdAt: { lt: expect.any(Date) },
        analyticsConsolidatedAt: { not: null },
      }),
    });
    expect(prisma.restaurantVisit.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: "org-a",
        closedAnalyticsConsolidatedAt: { not: null },
        openedAnalyticsConsolidatedAt: { not: null },
        orders: { every: { analyticsConsolidatedAt: { not: null } } },
      }),
      select: { id: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        consolidated: 7,
        deletedQrAccesses: 3,
        deletedVisits: 1,
      }),
    );
    expect(prisma.platformAdminEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "SYSTEM",
        action: "RESTAURANT_RETENTION_PURGE",
        organizationId: "org-a",
      }),
    });
  });
});
