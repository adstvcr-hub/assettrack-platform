import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateUserDto } from "./dto/create-user.dto";
import { UsersService } from "./users.service";
import { UserRole } from "../generated/prisma/enums";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UsersQueryDto } from "./dto/users-query.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ResetUserPasswordDto } from "./dto/reset-user-password.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";

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
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) {
    return this.usersService.create(req.user.organizationId, req.user.id, dto);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.update(
      req.user.organizationId,
      req.user.id,
      id,
      dto,
    );
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Patch(":id/password")
  resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetUserPasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.resetPassword(
      req.user.organizationId,
      req.user.id,
      id,
      dto.password,
    );
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.setActive(
      req.user.organizationId,
      req.user.id,
      id,
      dto.active,
    );
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post(":id/staff-access-qr")
  generateStaffAccessQr(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.generateStaffAccessQr(
      req.user.organizationId,
      req.user.id,
      id,
    );
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Delete(":id/staff-access-qr")
  revokeStaffAccessQr(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.revokeStaffAccessQr(
      req.user.organizationId,
      req.user.id,
      id,
    );
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.usersService.remove(req.user.organizationId, req.user.id, id);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Get()
  findAll(@Req() req: AuthenticatedRequest, @Query() query: UsersQueryDto) {
    return this.usersService.findAll(
      req.user.organizationId,
      query.page,
      query.limit,
    );
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Get(":id")
  findOne(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.usersService.findOne(req.user.organizationId, id);
  }
}
