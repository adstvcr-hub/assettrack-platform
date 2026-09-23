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
import { RolesGuard } from "../auth/roles.guard";
import {
  AssignWaiterDto,
  CancelOrderDto,
  CreateMenuItemDto,
  CreateTableDto,
  PlaceOrderDto,
  UpdateItemStatusDto,
  UpdateMenuItemDto,
  UpdateRestaurantRoleDto,
  UpdateRestaurantBillingDto,
  UpdateStaffAvailabilityDto,
  UpdateTableBillingDto,
} from "./dto/restaurant.dto";
import { RestaurantActor, RestaurantService } from "./restaurant.service";

type StaffRequest = Request & { user: RestaurantActor };

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

  @Get("profile")
  profile(@Req() req: StaffRequest) {
    return this.restaurant.profile(req.user);
  }

  @Get("tables")
  tables(@Req() req: StaffRequest) {
    return this.restaurant.tables(req.user);
  }

  @Post("tables")
  addTable(@Req() req: StaffRequest, @Body() dto: CreateTableDto) {
    return this.restaurant.addTable(req.user, dto);
  }

  @Patch("tables/:id/waiter")
  assignWaiter(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: AssignWaiterDto,
  ) {
    return this.restaurant.assignWaiter(req.user, id, dto.waiterId ?? null);
  }

  @Patch("tables/:id/billing")
  updateTableBilling(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateTableBillingDto,
  ) {
    return this.restaurant.updateTableBilling(req.user, id, dto);
  }

  @Get("billing-settings")
  billingSettings(@Req() req: StaffRequest) {
    return this.restaurant.billingSettings(req.user);
  }

  @Patch("billing-settings")
  updateBillingSettings(
    @Req() req: StaffRequest,
    @Body() dto: UpdateRestaurantBillingDto,
  ) {
    return this.restaurant.updateBillingSettings(req.user, dto);
  }

  @Get("tables/:id/qr")
  tableQr(@Req() req: StaffRequest, @Param("id") id: string) {
    return this.restaurant.tableQr(req.user, id);
  }

  @Get("menu")
  menu(@Req() req: StaffRequest) {
    return this.restaurant.menu(req.user);
  }

  @Post("menu")
  addMenu(@Req() req: StaffRequest, @Body() dto: CreateMenuItemDto) {
    return this.restaurant.addMenuItem(req.user, dto);
  }

  @Patch("menu/:id")
  updateMenu(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.restaurant.updateMenuItem(req.user, id, dto);
  }

  @Get("orders")
  orders(@Req() req: StaffRequest) {
    return this.restaurant.orders(req.user);
  }

  @Get("visits")
  visits(@Req() req: StaffRequest) {
    return this.restaurant.visits(req.user);
  }

  @Patch("items/:id/status")
  status(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateItemStatusDto,
  ) {
    return this.restaurant.updateStatus(req.user, id, dto);
  }

  @Get("staff-users")
  staffUsers(@Req() req: StaffRequest) {
    return this.restaurant.restaurantUsers(req.user);
  }

  @Patch("staff-users/:id/role")
  updateRestaurantRole(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateRestaurantRoleDto,
  ) {
    return this.restaurant.updateRestaurantRole(req.user, id, dto.role ?? null);
  }

  @Patch("staff-users/:id/availability")
  updateStaffAvailability(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateStaffAvailabilityDto,
  ) {
    return this.restaurant.updateStaffAvailability(req.user, id, dto);
  }

  @Patch("staff/availability")
  updateOwnStaffAvailability(
    @Req() req: StaffRequest,
    @Body() dto: UpdateStaffAvailabilityDto,
  ) {
    return this.restaurant.updateOwnStaffAvailability(req.user, dto);
  }

  @Patch("orders/:id/cancel")
  cancelOrder(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.restaurant.cancelOrder(req.user, id, dto.reason);
  }

  @Patch("visits/:id/close")
  closeVisit(@Req() req: StaffRequest, @Param("id") id: string) {
    return this.restaurant.closeVisit(req.user, id);
  }
}
