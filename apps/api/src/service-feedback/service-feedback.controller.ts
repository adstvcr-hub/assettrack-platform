import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../generated/prisma/enums";
import {
  CreateFeedbackCampaignDto,
  CreateFeedbackPromoterDto,
  FeedbackDashboardQueryDto,
  SubmitFeedbackVoteDto,
  UpdateFeedbackCampaignDto,
  UpdateFeedbackPromoterDto,
} from "./dto/service-feedback.dto";
import { ServiceFeedbackService } from "./service-feedback.service";

type AuthenticatedRequest = Request & {
  user: { id: string; organizationId: string };
};

@Controller("feedback/public")
export class ServiceFeedbackPublicController {
  constructor(private readonly feedback: ServiceFeedbackService) {}

  @Get(":code")
  survey(@Param("code") code: string) {
    return this.feedback.publicSurvey(code);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(":code/votes")
  vote(@Param("code") code: string, @Body() dto: SubmitFeedbackVoteDto) {
    return this.feedback.submitVote(code, dto);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
@Controller("feedback/admin")
export class ServiceFeedbackAdminController {
  constructor(private readonly feedback: ServiceFeedbackService) {}

  @Get("campaigns")
  campaigns(@Req() req: AuthenticatedRequest) {
    return this.feedback.campaigns(req.user.organizationId);
  }

  @Post("campaigns")
  createCampaign(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateFeedbackCampaignDto,
  ) {
    return this.feedback.createCampaign(
      req.user.organizationId,
      req.user.id,
      dto,
    );
  }

  @Patch("campaigns/:id")
  updateCampaign(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateFeedbackCampaignDto,
  ) {
    return this.feedback.updateCampaign(req.user.organizationId, id, dto);
  }

  @Post("campaigns/:id/promoters")
  createPromoter(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: CreateFeedbackPromoterDto,
  ) {
    return this.feedback.createPromoter(req.user.organizationId, id, dto);
  }

  @Patch("promoters/:id")
  updatePromoter(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateFeedbackPromoterDto,
  ) {
    return this.feedback.updatePromoter(req.user.organizationId, id, dto);
  }

  @Get("promoters/:id/qr")
  promoterQr(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.feedback.promoterQr(req.user.organizationId, id);
  }

  @Get("dashboard")
  dashboard(
    @Req() req: AuthenticatedRequest,
    @Query() query: FeedbackDashboardQueryDto,
  ) {
    return this.feedback.dashboard(req.user.organizationId, query);
  }
}
