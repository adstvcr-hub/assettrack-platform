import { ConflictException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformAdminService } from "./platform-admin.service";

function createService() {
  const prisma = {
    organization: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "org-new",
        name: "Restaurante Nuevo",
        slug: "restaurante-nuevo",
        restaurantAccessEnabled: true,
      }),
    },
    user: {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: "owner-new",
          name: data.name,
          email: data.email,
        }),
      ),
    },
    organizationLocation: { create: vi.fn().mockResolvedValue({}) },
    platformAdminEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
    ),
  };
  return {
    prisma,
    service: new PlatformAdminService(prisma as unknown as PrismaService),
  };
}

describe("PlatformAdminService restaurant onboarding", () => {
  beforeEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = "platform@assettrack.local";
  });

  afterEach(() => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
  });

  it("creates an isolated restaurant, owner and primary location atomically", async () => {
    const { prisma, service } = createService();
    const result = await service.createRestaurantOrganization(
      { id: "platform-admin", email: "platform@assettrack.local" },
      {
        name: " Restaurante Nuevo ",
        slug: "restaurante-nuevo",
        adminName: " Administrador Inicial ",
        adminEmail: "ADMIN@EXAMPLE.COM",
        country: "Costa Rica",
        region: "Guanacaste",
        city: "Bagaces",
        timezone: "America/Costa_Rica",
        enabled: true,
      },
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Restaurante Nuevo",
          slug: "restaurante-nuevo",
          restaurantAccessEnabled: true,
          restaurantDisplayName: "Restaurante Nuevo",
        }),
      }),
    );
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-new",
          name: "Administrador Inicial",
          email: "admin@example.com",
          role: "OWNER",
          restaurantRole: "RESTAURANT_ADMIN",
        }),
      }),
    );
    expect(prisma.organizationLocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-new",
        type: "BRANCH",
        country: "Costa Rica",
        region: "Guanacaste",
        city: "Bagaces",
        timezone: "America/Costa_Rica",
      }),
    });
    expect(prisma.platformAdminEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "RESTAURANT_ORGANIZATION_CREATED",
        organizationId: "org-new",
        targetUserId: "owner-new",
      }),
    });
    const passwordHash = prisma.user.create.mock.calls[0][0].data.passwordHash;
    await expect(
      bcrypt.compare(result.temporaryPassword, passwordHash),
    ).resolves.toBe(true);
  });

  it("rejects a duplicate organization identifier before creating data", async () => {
    const { prisma, service } = createService();
    prisma.organization.findUnique.mockResolvedValue({ id: "existing" });

    await expect(
      service.createRestaurantOrganization(
        { id: "platform-admin", email: "platform@assettrack.local" },
        {
          name: "Restaurante Nuevo",
          slug: "restaurante-nuevo",
          adminName: "Administrador",
          adminEmail: "admin@example.com",
          country: "Costa Rica",
          enabled: true,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
