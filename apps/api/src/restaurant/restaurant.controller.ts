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
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "../generated/prisma/enums";
import {
  CreateMenuItemDto,
  CreateTableDto,
  PlaceOrderDto,
  UpdateItemStatusDto,
  UpdateMenuItemDto,
} from "./dto/restaurant.dto";
import { RestaurantService } from "./restaurant.service";

type StaffRequest = Request & { user: { id: string; organizationId: string } };

@Controller("restaurant/guest")
export class RestaurantGuestController {
  constructor(private readonly restaurant: RestaurantService) {}

  @Get("tables/:code")
  menu(@Param("code") code: string) {
    return this.restaurant.guestMenu(code);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("tables/:code/orders")
  place(@Param("code") code: string, @Body() dto: PlaceOrderDto) {
    return this.restaurant.placeOrder(code, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get("orders/:accessCode")
  order(@Param("accessCode") accessCode: string) {
    return this.restaurant.guestOrder(accessCode);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("restaurant")
export class RestaurantStaffController {
  constructor(private readonly restaurant: RestaurantService) {}

  @Get("tables")
  tables(@Req() req: StaffRequest) {
    return this.restaurant.tables(req.user.organizationId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post("tables")
  addTable(@Req() req: StaffRequest, @Body() dto: CreateTableDto) {
    return this.restaurant.addTable(req.user.organizationId, dto);
  }

  @Get("tables/:id/qr")
  tableQr(@Req() req: StaffRequest, @Param("id") id: string) {
    return this.restaurant.tableQr(req.user.organizationId, id);
  }

  @Get("menu")
  menu(@Req() req: StaffRequest) {
    return this.restaurant.menu(req.user.organizationId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Post("menu")
  addMenu(@Req() req: StaffRequest, @Body() dto: CreateMenuItemDto) {
    return this.restaurant.addMenuItem(req.user.organizationId, dto);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Patch("menu/:id")
  updateMenu(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.restaurant.updateMenuItem(req.user.organizationId, id, dto);
  }

  @Get("orders")
  orders(@Req() req: StaffRequest) {
    return this.restaurant.orders(req.user.organizationId);
  }

  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.USER)
  @Patch("items/:id/status")
  status(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateItemStatusDto,
  ) {
    return this.restaurant.updateStatus(
      req.user.organizationId,
      req.user.id,
      id,
      dto,
    );
  }
}
