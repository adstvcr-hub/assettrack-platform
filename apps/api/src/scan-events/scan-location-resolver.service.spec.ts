import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { ScanLocationResolverService } from "./scan-location-resolver.service";

function createResolver() {
  const prisma = {
    organizationLocation: { findFirst: vi.fn() },
  };

  return {
    prisma,
    resolver: new ScanLocationResolverService(
      prisma as unknown as PrismaService,
    ),
  };
}

describe("ScanLocationResolverService", () => {
  it("gives GPS precedence over a saved location", async () => {
    const { prisma, resolver } = createResolver();

    const result = await resolver.resolve("org-a", {
      latitude: 10.6333,
      longitude: -85.4333,
      organizationLocationId: "location-a",
    });

    expect(result.locationSource).toBe("GPS");
    expect(prisma.organizationLocation.findFirst).not.toHaveBeenCalled();
  });

  it("copies an active saved location snapshot for the same organization", async () => {
    const { prisma, resolver } = createResolver();
    prisma.organizationLocation.findFirst.mockResolvedValue({
      id: "location-a",
      name: "Main plant",
      country: "CR",
      region: "Guanacaste",
      city: "Bagaces",
      address: "Industrial park",
      latitude: 10.6333,
      longitude: -85.4333,
      timezone: "America/Costa_Rica",
    });

    const result = await resolver.resolve("org-a", {
      organizationLocationId: "location-a",
    });

    expect(prisma.organizationLocation.findFirst).toHaveBeenCalledWith({
      where: { id: "location-a", organizationId: "org-a", active: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        organizationLocationId: "location-a",
        locationSource: "ORGANIZATION_LOCATION",
        locationName: "Main plant",
        country: "CR",
        city: "Bagaces",
      }),
    );
  });

  it("rejects inactive or cross-organization saved locations", async () => {
    const { prisma, resolver } = createResolver();
    prisma.organizationLocation.findFirst.mockResolvedValue(null);

    await expect(
      resolver.resolve("org-a", { organizationLocationId: "location-a" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    [{ country: "CR", city: "Bagaces" }, "MANUAL"],
    [{ timezone: "America/Costa_Rica" }, "DEVICE_TIMEZONE"],
    [{}, "UTC_FALLBACK"],
  ] as const)("resolves fallback sources consistently", async (dto, source) => {
    const { resolver } = createResolver();

    const result = await resolver.resolve("org-a", { ...dto });

    expect(result.locationSource).toBe(source);
  });
});
