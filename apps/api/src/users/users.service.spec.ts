import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import {
  RestaurantStaffAvailability,
  UserRole,
} from "../generated/prisma/enums";
import { UsersService } from "./users.service";

const target = {
  id: "user-a",
  organizationId: "org-a",
  email: "old@example.com",
  name: "Old name",
  role: UserRole.USER,
  restaurantRole: null,
  restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
  active: true,
  deactivatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService() {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(target),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(2),
      create: vi.fn(),
      update: vi
        .fn()
        .mockImplementation(({ data }) => ({ ...target, ...data })),
      delete: vi.fn(),
    },
    refreshToken: { updateMany: vi.fn() },
    userManagementEvent: { create: vi.fn() },
    restaurantVisit: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
    },
    restaurantTable: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(),
    },
    scanEvent: { count: vi.fn().mockResolvedValue(0) },
    restaurantItemEvent: { count: vi.fn().mockResolvedValue(0) },
    restaurantStaffEvent: { count: vi.fn().mockResolvedValue(0) },
    restaurantVisitTransfer: { count: vi.fn().mockResolvedValue(0) },
    platformAdminEvent: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
    ),
  };
  return {
    prisma,
    service: new UsersService(prisma as unknown as PrismaService),
  };
}

describe("UsersService", () => {
  it("normalizes a changed email and closes previous sessions", async () => {
    const { prisma, service } = createService();
    prisma.user.findFirst
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(null);

    await service.update("org-a", "admin-a", target.id, {
      name: "New name",
      email: "  NEW@Example.COM ",
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "New name",
          email: "new@example.com",
          sessionVersion: { increment: 1 },
        }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(prisma.userManagementEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "USER_PROFILE_UPDATED" }),
      }),
    );
  });

  it("deactivates a user, closes sessions and records the action", async () => {
    const { prisma, service } = createService();

    await service.setActive("org-a", "admin-a", target.id, false);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          active: false,
          restaurantAvailability: RestaurantStaffAvailability.OFF_SHIFT,
          sessionVersion: { increment: 1 },
        }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(prisma.userManagementEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "USER_DEACTIVATED" }),
      }),
    );
  });

  it("permanently deletes a user without operational history", async () => {
    const { prisma, service } = createService();

    const result = await service.remove("org-a", "admin-a", target.id);

    expect(result.mode).toBe("DELETED");
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: target.id },
    });
  });
});
