import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it, vi } from "vitest";
import {
  RestaurantStaffAvailability,
  UserRole,
} from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";

async function createService() {
  const access = {
    id: "access-a",
    active: true,
    user: {
      id: "user-a",
      organizationId: "org-a",
      email: "waiter@example.com",
      name: "Mesero 1",
      passwordHash: await bcrypt.hash("password-123", 4),
      role: UserRole.USER,
      restaurantRole: "WAITER",
      restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
      active: true,
      sessionVersion: 0,
      organization: {
        name: "Restaurante Demo",
        restaurantDisplayName: "Bar Mariposa",
        restaurantAccessEnabled: true,
      },
    },
  };
  const prisma = {
    staffAccessCode: {
      findUnique: vi.fn().mockResolvedValue(access),
      update: vi.fn(),
    },
    restaurantStaffSession: {
      updateMany: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "session-a" }),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
    ),
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue("access-token") };
  return {
    prisma,
    jwt,
    service: new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
    ),
  };
}

describe("AuthService staff QR access", () => {
  it("returns only safe staff identity data for a valid QR", async () => {
    const { service } = await createService();

    await expect(service.staffAccessProfile("a".repeat(43))).resolves.toEqual({
      restaurantName: "Bar Mariposa",
      staffName: "Mesero 1",
      staffRole: "WAITER",
    });
  });

  it("creates a normal session after validating the password", async () => {
    const { prisma, jwt, service } = await createService();

    const result = await service.loginWithStaffAccess(
      "a".repeat(43),
      "password-123",
    );

    expect(result.accessToken).toBe("access-token");
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "user-a", restaurantRole: "WAITER" }),
    );
    expect(prisma.staffAccessCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastUsedAt: expect.any(Date) } }),
    );
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(prisma.restaurantStaffSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-a",
        initialAvailability: RestaurantStaffAvailability.AVAILABLE,
      }),
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        restaurantStaffSessionId: "session-a",
      }),
    });
  });

  it("records the staff exit time when the session is closed", async () => {
    const { prisma, service } = await createService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: "refresh-a",
      restaurantStaffSessionId: "session-a",
    });

    await service.logout("refresh-token");

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "refresh-a", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.restaurantStaffSession.updateMany).toHaveBeenCalledWith({
      where: { id: "session-a", endedAt: null },
      data: { endedAt: expect.any(Date), lastSeenAt: expect.any(Date) },
    });
  });
});
