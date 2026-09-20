import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { ScanEventsService } from "./scan-events.service";
import { ScanLocationResolverService } from "./scan-location-resolver.service";

const resolvedLocation = {
  locationSource: "MANUAL" as const,
  country: "CR",
  city: "Bagaces",
  latitude: undefined,
  longitude: undefined,
  locationAccuracy: undefined,
  timezone: "America/Costa_Rica",
  timezoneOffset: -360,
  scannedAt: new Date("2026-09-20T12:00:00.000Z"),
};

function createService() {
  const prisma = {
    asset: { findFirst: vi.fn() },
    scanEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([[], 0]),
  };
  const locationResolver = {
    resolve: vi.fn().mockResolvedValue(resolvedLocation),
  };

  return {
    prisma,
    locationResolver,
    service: new ScanEventsService(
      prisma as unknown as PrismaService,
      locationResolver as unknown as ScanLocationResolverService,
    ),
  };
}

describe("ScanEventsService.findAll", () => {
  it("filters by location source and searches location snapshot fields", async () => {
    const { prisma, service } = createService();

    await service.findAll(
      "org-a",
      1,
      25,
      "Bagaces",
      undefined,
      undefined,
      "MANUAL",
    );

    expect(prisma.scanEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          asset: { organizationId: "org-a" },
          locationSource: "MANUAL",
          OR: expect.arrayContaining([
            {
              locationName: {
                contains: "Bagaces",
                mode: "insensitive",
              },
            },
            {
              city: { contains: "Bagaces", mode: "insensitive" },
            },
            {
              address: { contains: "Bagaces", mode: "insensitive" },
            },
          ]),
        }),
      }),
    );
    expect(prisma.scanEvent.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ locationSource: "MANUAL" }),
    });
  });

  it("uses the shared location resolver when creating a legacy scan event", async () => {
    const { prisma, locationResolver, service } = createService();
    prisma.asset.findFirst.mockResolvedValue({ id: "asset-a" });
    prisma.scanEvent.create.mockResolvedValue({ id: "scan-a" });

    await service.create("org-a", "user-a", {
      assetId: "00000000-0000-4000-8000-000000000001",
      country: "CR",
      city: "Bagaces",
    });

    expect(locationResolver.resolve).toHaveBeenCalledWith(
      "org-a",
      expect.objectContaining({ country: "CR", city: "Bagaces" }),
    );
    expect(prisma.scanEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-a",
        locationSource: "MANUAL",
        country: "CR",
        city: "Bagaces",
      }),
    });
  });
});
