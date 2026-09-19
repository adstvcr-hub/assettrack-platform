import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CheckSimilarLocationNameDto } from "./dto/check-similar-location-name.dto";
import { UserRole } from "../generated/prisma/enums";
import { CreateOrganizationLocationDto } from "./dto/create-organization-location.dto";
import { UpdateOrganizationLocationDto } from "./dto/update-organization-location.dto";
import { OrganizationLocationsService } from "./organization-locations.service";

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
@Controller("organization-locations")
export class OrganizationLocationsController {
  constructor(
    private readonly organizationLocationsService: OrganizationLocationsService,
  ) {}

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post()
  create(
    @Body() dto: CreateOrganizationLocationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.organizationLocationsService.create(
      req.user.organizationId,
      dto,
    );
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.organizationLocationsService.findAll(req.user.organizationId);
  }
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post("check-similar-name")
  async checkSimilarName(
    @Body() dto: CheckSimilarLocationNameDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const similar = await this.organizationLocationsService.findSimilarName(
      req.user.organizationId,
      dto.name,
      dto.excludeId,
    );

    if (!similar) {
      return {
        similar: false,
        match: null,
      };
    }

    return {
      similar: true,
      match: {
        id: similar.id,
        name: similar.name,
        similarity: similar.similarity,
      },
    };
  }
  @Get(":id")
  findOne(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.organizationLocationsService.findOne(
      req.user.organizationId,
      id,
    );
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateOrganizationLocationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.organizationLocationsService.update(
      req.user.organizationId,
      id,
      dto,
    );
  }
}
