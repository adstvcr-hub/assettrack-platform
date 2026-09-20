import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { ScanController } from "./scan.controller";
import { ScanLocationResolverService } from "./scan-location-resolver.service";

const request = {
  user: {
    id: "user-a",
    organizationId: "org-a",
    email: "user@example.com",
    name: "User",
    role: "USER",
  },
};

function createController(assetOrganizationId = "org-a") {
  const prisma = {
    qrCode: {
      findUnique: vi.fn().mockResolvedValue({
        assetId: "asset-a",
        asset: { id: "asset-a", organizationId: assetOrganizationId },
      }),
    },
    organizationLocation: { findFirst: vi.fn() },
    scanEvent: {
      create: vi
        .fn()
        .mockImplementation(({ data }) => ({ id: "scan-a", ...data })),
    },
  };

  return {
    prisma,
    controller: new ScanController(
      prisma as unknown as PrismaService,
      new ScanLocationResolverService(prisma as unknown as PrismaService),
    ),
  };
}

describe("ScanController location resolution", () => {
  it("hides assets belonging to another organization", async () => {
    const { controller, prisma } = createController("org-b");

    await expect(
      controller.scan("ATQR-1", {}, request as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.scanEvent.create).not.toHaveBeenCalled();
  });

  it("gives GPS precedence over a selected organization location", async () => {
    const { controller, prisma } = createController();

    await controller.scan(
      "ATQR-1",
      {
        latitude: 10.6333,
        longitude: -85.4333,
        organizationLocationId: "location-a",
        timezone: "UTC",
      },
      request as never,
    );

    expect(prisma.organizationLocation.findFirst).not.toHaveBeenCalled();
    expect(prisma.scanEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locationSource: "GPS",
          latitude: 10.6333,
          longitude: -85.4333,
        }),
      }),
    );
  });

  it("rejects inactive or cross-organization saved locations", async () => {
    const { controller, prisma } = createController();
    prisma.organizationLocation.findFirst.mockResolvedValue(null);

    await expect(
      controller.scan(
        "ATQR-1",
        { organizationLocationId: "location-a" },
        request as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.organizationLocation.findFirst).toHaveBeenCalledWith({
      where: { id: "location-a", organizationId: "org-a", active: true },
    });
  });

  it.each([
    [{ country: "CR", city: "Bagaces" }, "MANUAL"],
    [{ timezone: "America/Costa_Rica" }, "DEVICE_TIMEZONE"],
    [{}, "UTC_FALLBACK"],
  ] as const)("stores the expected fallback source", async (dto, source) => {
    const { controller, prisma } = createController();

    await controller.scan("ATQR-1", { ...dto }, request as never);

    expect(prisma.scanEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ locationSource: source }),
      }),
    );
  });
});
