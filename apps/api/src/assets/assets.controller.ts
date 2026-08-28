import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  Patch,
} from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AssetsService } from "./assets.service";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { UpdateAssetDto } from "./dto/update-asset.dto";
import { UserRole } from "../generated/prisma/enums";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    organizationId: string;
    email: string;
    name: string;
    role: string;
  };
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("assets")
export class AssetsController {
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateAssetDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assetsService.update(req.user.organizationId, id, dto);
  }
  constructor(private readonly assetsService: AssetsService) {}
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateAssetDto, @Req() req: AuthenticatedRequest) {
    return this.assetsService.create(req.user.organizationId, dto);
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.assetsService.findAll(req.user.organizationId);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.assetsService.findOne(req.user.organizationId, id);
  }
}
