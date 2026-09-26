import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PlatformAdminService, PlatformActor } from "./platform-admin.service";
import { ResetUserCredentialDto, UpdateRestaurantAccessDto } from "./dto/platform-admin.dto";
import { CreateRewardProgramDto } from "../restaurant/dto/restaurant.dto";

type PlatformRequest = Request & { user: PlatformActor };

@UseGuards(JwtAuthGuard)
@Controller("platform-admin")
export class PlatformAdminController {
  constructor(private readonly platform: PlatformAdminService) {}

  @Get("profile")
  profile(@Req() req: PlatformRequest) {
    return this.platform.profile(req.user);
  }

  @Get("overview")
  overview(
    @Req() req: PlatformRequest,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.platform.overview(req.user, from, to);
  }

  @Get("organizations")
  organizations(@Req() req: PlatformRequest) {
    return this.platform.organizations(req.user);
  }

  @Get("organizations/:id/users")
  organizationUsers(@Req() req: PlatformRequest, @Param("id") id: string) {
    return this.platform.organizationUsers(req.user, id);
  }

  @Patch("organizations/:id/restaurant-access")
  setAccess(
    @Req() req: PlatformRequest,
    @Param("id") id: string,
    @Body() dto: UpdateRestaurantAccessDto,
  ) {
    return this.platform.setRestaurantAccess(req.user, id, dto.enabled);
  }

  @Post("organizations/:organizationId/users/:userId/reset-password")
  resetPassword(
    @Req() req: PlatformRequest,
    @Param("organizationId") organizationId: string,
    @Param("userId") userId: string,
    @Body() dto: ResetUserCredentialDto,
  ) {
    return this.platform.resetCredential(
      req.user,
      organizationId,
      userId,
      dto.reason,
    );
  }

  @Post("loyalty/rewards")
  createAssetTrackReward(
    @Req() req: PlatformRequest,
    @Body() dto: CreateRewardProgramDto,
  ) {
    return this.platform.createAssetTrackReward(req.user, dto);
  }
}
