import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ServiceFeedbackService } from "./service-feedback.service";

describe("ServiceFeedbackService", () => {
  it("stores only the anonymous rating and survey relationships", async () => {
    const create = vi.fn().mockResolvedValue({ id: "vote-a" });
    const prisma = {
      serviceFeedbackPromoter: {
        findUnique: vi.fn().mockResolvedValue({
          id: "promoter-a",
          organizationId: "org-a",
          active: true,
          campaign: { id: "campaign-a", active: true },
        }),
      },
      serviceFeedbackVote: { create },
    };
    const service = new ServiceFeedbackService(prisma as never);

    await expect(service.submitVote("public-code", { rating: 5 })).resolves.toEqual({
      accepted: true,
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-a",
        campaignId: "campaign-a",
        promoterId: "promoter-a",
        rating: 5,
      },
      select: { id: true },
    });
  });

  it("rejects votes when the promoter or campaign is inactive", async () => {
    const create = vi.fn();
    const prisma = {
      serviceFeedbackPromoter: {
        findUnique: vi.fn().mockResolvedValue({
          id: "promoter-a",
          organizationId: "org-a",
          active: false,
          campaign: { id: "campaign-a", active: true },
        }),
      },
      serviceFeedbackVote: { create },
    };
    const service = new ServiceFeedbackService(prisma as never);

    await expect(
      service.submitVote("public-code", { rating: 2 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it("aggregates satisfaction and results per promoter", async () => {
    const prisma = {
      serviceFeedbackVote: {
        count: vi.fn().mockResolvedValue(4),
        aggregate: vi.fn().mockResolvedValue({ _avg: { rating: 3.75 } }),
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            { rating: 1, _count: { _all: 1 } },
            { rating: 4, _count: { _all: 1 } },
            { rating: 5, _count: { _all: 2 } },
          ])
          .mockResolvedValueOnce([
            { promoterId: "promoter-a", rating: 1, _count: { _all: 1 } },
            { promoterId: "promoter-a", rating: 4, _count: { _all: 1 } },
            { promoterId: "promoter-a", rating: 5, _count: { _all: 2 } },
          ]),
        findMany: vi.fn().mockResolvedValue([]),
      },
      serviceFeedbackPromoter: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "promoter-a",
            name: "Ana",
            active: true,
            campaign: { id: "campaign-a", name: "Servicio" },
          },
        ]),
      },
    };
    const service = new ServiceFeedbackService(prisma as never);

    const result = await service.dashboard("org-a", {});

    expect(result.summary).toEqual({
      total: 4,
      average: 3.75,
      positive: 3,
      positivePercent: 75,
    });
    expect(result.promoters[0]).toEqual(
      expect.objectContaining({
        name: "Ana",
        voteCount: 4,
        average: 3.75,
      }),
    );
  });
});
