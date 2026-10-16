import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as QRCode from "qrcode";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateFeedbackCampaignDto,
  CreateFeedbackPromoterDto,
  FeedbackDashboardQueryDto,
  SubmitFeedbackVoteDto,
  UpdateFeedbackCampaignDto,
  UpdateFeedbackPromoterDto,
} from "./dto/service-feedback.dto";

@Injectable()
export class ServiceFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  private dateRange(query: FeedbackDashboardQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "")) {
      to.setUTCDate(to.getUTCDate() + 1);
    }
    if (from && to && from >= to) {
      throw new BadRequestException("La fecha inicial debe ser anterior a la final");
    }
    return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } : undefined;
  }

  async campaigns(organizationId: string) {
    return this.prisma.serviceFeedbackCampaign.findMany({
      where: { organizationId },
      include: {
        _count: { select: { promoters: true, votes: true } },
        promoters: {
          orderBy: { name: "asc" },
          include: { _count: { select: { votes: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  createCampaign(
    organizationId: string,
    createdById: string,
    dto: CreateFeedbackCampaignDto,
  ) {
    return this.prisma.serviceFeedbackCampaign.create({
      data: {
        organizationId,
        createdById,
        name: dto.name.trim(),
        question:
          dto.question?.trim() || "¿Cómo califica el servicio recibido?",
      },
    });
  }

  async updateCampaign(
    organizationId: string,
    campaignId: string,
    dto: UpdateFeedbackCampaignDto,
  ) {
    const campaign = await this.prisma.serviceFeedbackCampaign.findFirst({
      where: { id: campaignId, organizationId },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException("Encuesta no encontrada");
    return this.prisma.serviceFeedbackCampaign.update({
      where: { id: campaign.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.question !== undefined
          ? { question: dto.question.trim() }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async createPromoter(
    organizationId: string,
    campaignId: string,
    dto: CreateFeedbackPromoterDto,
  ) {
    const campaign = await this.prisma.serviceFeedbackCampaign.findFirst({
      where: { id: campaignId, organizationId },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException("Encuesta no encontrada");
    return this.prisma.serviceFeedbackPromoter.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        name: dto.name.trim(),
      },
    });
  }

  async updatePromoter(
    organizationId: string,
    promoterId: string,
    dto: UpdateFeedbackPromoterDto,
  ) {
    const promoter = await this.prisma.serviceFeedbackPromoter.findFirst({
      where: { id: promoterId, organizationId },
      select: { id: true },
    });
    if (!promoter) throw new NotFoundException("Impulsador no encontrado");
    return this.prisma.serviceFeedbackPromoter.update({
      where: { id: promoter.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async promoterQr(organizationId: string, promoterId: string) {
    const promoter = await this.prisma.serviceFeedbackPromoter.findFirst({
      where: { id: promoterId, organizationId },
      include: { campaign: { select: { name: true } } },
    });
    if (!promoter) throw new NotFoundException("Impulsador no encontrado");
    const webUrl = (process.env.PUBLIC_WEB_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const accessUrl = `${webUrl}/feedback/${encodeURIComponent(promoter.code)}`;
    return {
      promoterId: promoter.id,
      promoterName: promoter.name,
      campaignName: promoter.campaign.name,
      accessUrl,
      image: await QRCode.toDataURL(accessUrl, { width: 500, margin: 2 }),
    };
  }

  async publicSurvey(code: string) {
    const promoter = await this.prisma.serviceFeedbackPromoter.findUnique({
      where: { code },
      include: {
        campaign: true,
        organization: { select: { name: true } },
      },
    });
    if (!promoter || !promoter.active || !promoter.campaign.active) {
      throw new NotFoundException("Esta encuesta no está disponible");
    }
    return {
      campaignName: promoter.campaign.name,
      question: promoter.campaign.question,
      organizationName: promoter.organization.name,
      promoterName: promoter.name,
    };
  }

  async submitVote(code: string, dto: SubmitFeedbackVoteDto) {
    const promoter = await this.prisma.serviceFeedbackPromoter.findUnique({
      where: { code },
      include: { campaign: { select: { id: true, active: true } } },
    });
    if (!promoter || !promoter.active || !promoter.campaign.active) {
      throw new NotFoundException("Esta encuesta no está disponible");
    }
    await this.prisma.serviceFeedbackVote.create({
      data: {
        organizationId: promoter.organizationId,
        campaignId: promoter.campaign.id,
        promoterId: promoter.id,
        rating: dto.rating,
      },
      select: { id: true },
    });
    return { accepted: true };
  }

  async dashboard(
    organizationId: string,
    query: FeedbackDashboardQueryDto,
  ) {
    if (query.campaignId) {
      const campaign = await this.prisma.serviceFeedbackCampaign.findFirst({
        where: { id: query.campaignId, organizationId },
        select: { id: true },
      });
      if (!campaign) throw new NotFoundException("Encuesta no encontrada");
    }
    const createdAt = this.dateRange(query);
    const where = {
      organizationId,
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [total, average, distributionRows, promoterRatingRows, promoters, recentVotes] =
      await Promise.all([
        this.prisma.serviceFeedbackVote.count({ where }),
        this.prisma.serviceFeedbackVote.aggregate({ where, _avg: { rating: true } }),
        this.prisma.serviceFeedbackVote.groupBy({
          by: ["rating"],
          where,
          _count: { _all: true },
          orderBy: { rating: "asc" },
        }),
        this.prisma.serviceFeedbackVote.groupBy({
          by: ["promoterId", "rating"],
          where,
          _count: { _all: true },
        }),
        this.prisma.serviceFeedbackPromoter.findMany({
          where: {
            organizationId,
            ...(query.campaignId ? { campaignId: query.campaignId } : {}),
          },
          include: { campaign: { select: { id: true, name: true } } },
          orderBy: { name: "asc" },
        }),
        this.prisma.serviceFeedbackVote.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            rating: true,
            createdAt: true,
            promoter: { select: { id: true, name: true } },
            campaign: { select: { id: true, name: true } },
          },
        }),
      ]);

    const distribution = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count:
        distributionRows.find((row) => row.rating === rating)?._count._all ?? 0,
    }));
    const promoterResults = promoters.map((promoter) => {
      const ratings = [1, 2, 3, 4, 5].map((rating) => ({
        rating,
        count:
          promoterRatingRows.find(
            (row) => row.promoterId === promoter.id && row.rating === rating,
          )?._count._all ?? 0,
      }));
      const voteCount = ratings.reduce((sum, row) => sum + row.count, 0);
      const ratingTotal = ratings.reduce(
        (sum, row) => sum + row.rating * row.count,
        0,
      );
      return {
        id: promoter.id,
        name: promoter.name,
        active: promoter.active,
        campaign: promoter.campaign,
        voteCount,
        average: voteCount ? ratingTotal / voteCount : 0,
        ratings,
      };
    });
    const positive = distribution
      .filter((row) => row.rating >= 4)
      .reduce((sum, row) => sum + row.count, 0);

    return {
      filters: query,
      summary: {
        total,
        average: average._avg.rating ?? 0,
        positive,
        positivePercent: total ? Math.round((positive / total) * 1000) / 10 : 0,
      },
      distribution,
      promoters: promoterResults,
      recentVotes,
    };
  }
}
