import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';
import { UserRole } from '../generated/prisma/enums';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

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
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post()
  create(
    @Body() dto: CreateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.create(
      req.user.organizationId,
      dto,
    );
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.usersService.findAll(
      req.user.organizationId,
    );
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.findOne(
      req.user.organizationId,
      id,
    );
  }
}