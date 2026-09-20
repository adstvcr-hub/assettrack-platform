import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationLocationsService } from "./organization-locations.service";

function createService() {
  const prisma = {
    organizationLocation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    prisma,
    service: new OrganizationLocationsService(
      prisma as unknown as PrismaService,
    ),
  };
}

describe("OrganizationLocationsService", () => {
  it("scopes reads to the authenticated organization", async () => {
    const { prisma, service } = createService();
    prisma.organizationLocation.findFirst.mockResolvedValue(null);

    await expect(service.findOne("org-a", "location-a")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.organizationLocation.findFirst).toHaveBeenCalledWith({
      where: { id: "location-a", organizationId: "org-a" },
    });
  });

  it("turns normalized unique-key conflicts into HTTP conflicts", async () => {
    const { prisma, service } = createService();
    prisma.organizationLocation.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.create("org-a", {
        name: " Área-de-Producción ",
        country: "CR",
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.organizationLocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-a",
        nameKey: "area de produccion",
      }),
    });
  });

  it("excludes the edited record while checking similar names", async () => {
    const { prisma, service } = createService();
    prisma.organizationLocation.findMany.mockResolvedValue([
      { id: "other", name: "Bodega Principa" },
    ]);

    const result = await service.findSimilarName(
      "org-a",
      "Bodega Principal",
      "current",
    );

    expect(prisma.organizationLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-a", id: { not: "current" } },
      }),
    );
    expect(result?.id).toBe("other");
  });
});
