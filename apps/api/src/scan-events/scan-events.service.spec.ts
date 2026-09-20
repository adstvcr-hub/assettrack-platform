import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { ScanEventsService } from "./scan-events.service";

describe("ScanEventsService.findAll", () => {
  it("filters by location source and searches location snapshot fields", async () => {
    const prisma = {
      scanEvent: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    };
    const service = new ScanEventsService(prisma as unknown as PrismaService);

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
});
