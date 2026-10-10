import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import {
  AssignWaiterDto,
  AssumeCashSessionDto,
  CancelOrderDto,
  CloseVisitDto,
  CloseCashSessionDto,
  CreateEmployeePaymentDto,
  CreateRewardProgramDto,
  CreateStaffOrderDto,
  CreatePromotionDto,
  CreateMenuItemDto,
  CreateInventoryCategoryDto,
  CreateInventoryMovementDto,
  CreateInventoryProductDto,
  CreateLiquorWeighingDto,
  CreateSupplierInvoiceDto,
  SaveInventoryRecipeDto,
  CorrectGuestOrderDto,
  CorrectStaffOrderDto,
  CreateTableDto,
  JoinLoyaltyDto,
  PlaceOrderDto,
  RecordQrAccessDto,
  RequestInvoiceDto,
  RequestGuestOrderCorrectionDto,
  UpdateItemStatusDto,
  UpdateItemFulfillmentDto,
  UpdateInvoiceRequestDto,
  UpdateMenuItemDto,
  UpdateInventoryProductDto,
  UpdateRestaurantRoleDto,
  UpdateRestaurantBillingDto,
  UpdateRestaurantBrandingDto,
  UpdateRestaurantOrderingAreaDto,
  UpdateCashAuthorizationDto,
  UpdateStaffAvailabilityDto,
  UpdateStaffPayrollDto,
  UpdateTableBillingDto,
  UpdateVisitPaymentDto,
  UpdatePromotionDto,
  TransferVisitDto,
} from "./dto/restaurant.dto";
import { RestaurantActor, RestaurantService } from "./restaurant.service";
import { RestaurantCashService } from "./restaurant-cash.service";
import { RestaurantAccessGuard } from "./restaurant-access.guard";
import { UsersService } from "../users/users.service";
import { RestaurantStaffRole, UserRole } from "../generated/prisma/enums";

type StaffRequest = Request & { user: RestaurantActor };

@Controller("restaurant/guest")
export class RestaurantGuestController {
  constructor(private readonly restaurant: RestaurantService) {}

  @Get("tables/:code")
  menu(@Param("code") code: string) {
    return this.restaurant.guestMenu(code);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post("tables/:code/access")
  access(@Param("code") code: string, @Body() dto: RecordQrAccessDto) {
    return this.restaurant.recordQrAccess(code, dto);
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

  @Throttle({ default: { limit: 6, ttl: 60000 } })
  @Patch("orders/:accessCode/correction")
  correctOrder(
    @Param("accessCode") accessCode: string,
    @Body() dto: CorrectGuestOrderDto,
  ) {
    return this.restaurant.correctGuestOrder(accessCode, dto);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post("orders/:accessCode/correction-request")
  requestOrderCorrection(
    @Param("accessCode") accessCode: string,
    @Body() dto: RequestGuestOrderCorrectionDto,
  ) {
    return this.restaurant.requestGuestOrderCorrection(accessCode, dto);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post("orders/:accessCode/invoice-request")
  requestInvoice(
    @Param("accessCode") accessCode: string,
    @Body() dto: RequestInvoiceDto,
  ) {
    return this.restaurant.requestInvoice(accessCode, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("orders/:accessCode/loyalty")
  joinLoyalty(
    @Param("accessCode") accessCode: string,
    @Body() dto: JoinLoyaltyDto,
  ) {
    return this.restaurant.joinLoyalty(accessCode, dto);
  }

  @Get("orders/:accessCode/receipt")
  receipt(@Param("accessCode") accessCode: string) {
    return this.restaurant.guestReceipt(accessCode);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard, RestaurantAccessGuard)
@Controller("restaurant")
export class RestaurantStaffController {
  constructor(
    private readonly restaurant: RestaurantService,
    private readonly users: UsersService,
    private readonly cash: RestaurantCashService,
  ) {}

  private requireRestaurantAdministrator(actor: RestaurantActor) {
    if (
      actor.role !== UserRole.OWNER &&
      actor.role !== UserRole.ADMIN &&
      actor.restaurantRole !== RestaurantStaffRole.RESTAURANT_ADMIN
    ) {
      throw new ForbiddenException("Restaurant administrator role required");
    }
  }

  @Get("profile")
  profile(@Req() req: StaffRequest) {
    return this.restaurant.profile(req.user);
  }

  @Get("cash-registers/current")
  cashCurrent(@Req() req: StaffRequest) {
    return this.cash.current(req.user);
  }

  @Post("cash-registers/assume")
  assumeCash(@Req() req: StaffRequest, @Body() dto: AssumeCashSessionDto) {
    return this.cash.assume(req.user, dto.openingCash);
  }

  @Post("cash-sessions/:id/close")
  closeCashSession(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: CloseCashSessionDto,
  ) {
    return this.cash.close(req.user, id, dto);
  }

  @Get("cash-registers/daily")
  cashDaily(
    @Req() req: StaffRequest,
    @Query("date") date?: string,
  ) {
    return this.cash.daily(req.user, date);
  }

  @Get("cash-registers/history")
  cashHistory(
    @Req() req: StaffRequest,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.cash.history(req.user, from, to);
  }

  @Post("cash-registers/supplier-invoices")
  addSupplierInvoice(
    @Req() req: StaffRequest,
    @Body() dto: CreateSupplierInvoiceDto,
  ) {
    return this.cash.addSupplierInvoice(req.user, dto);
  }

  @Post("cash-registers/employee-payments")
  addEmployeePayment(
    @Req() req: StaffRequest,
    @Body() dto: CreateEmployeePaymentDto,
  ) {
    return this.cash.addEmployeePayment(req.user, dto);
  }

  @Get("cash-registers/employees")
  cashEmployees(@Req() req: StaffRequest) {
    return this.cash.employees(req.user);
  }

  @Get("staff/daily-close")
  employeeDailyClose(
    @Req() req: StaffRequest,
    @Query("date") date?: string,
    @Query("userId") userId?: string,
  ) {
    return this.cash.employeeDaily(req.user, date, userId);
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

  @Get("ordering-area-settings")
  orderingAreaSettings(@Req() req: StaffRequest) {
    return this.restaurant.orderingAreaSettings(req.user);
  }

  @Patch("ordering-area-settings")
  updateOrderingAreaSettings(
    @Req() req: StaffRequest,
    @Body() dto: UpdateRestaurantOrderingAreaDto,
  ) {
    return this.restaurant.updateOrderingAreaSettings(req.user, dto);
  }

  @Get("analytics")
  analytics(
    @Req() req: StaffRequest,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.restaurant.analytics(req.user, from, to);
  }

  @Get("sales-history")
  salesHistory(
    @Req() req: StaffRequest,
    @Query("search") search?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.restaurant.salesHistory(
      req.user,
      search,
      from,
      to,
      Number(page ?? 1),
      Number(limit ?? 25),
    );
  }

  @Get("sales-history/export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="historial-ventas.csv"')
  salesHistoryExport(
    @Req() req: StaffRequest,
    @Query("search") search?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.restaurant.salesHistoryCsv(req.user, search, from, to);
  }

  @Patch("billing-settings")
  updateBillingSettings(
    @Req() req: StaffRequest,
    @Body() dto: UpdateRestaurantBillingDto,
  ) {
    return this.restaurant.updateBillingSettings(req.user, dto);
  }

  @Get("branding-settings")
  brandingSettings(@Req() req: StaffRequest) {
    return this.restaurant.brandingSettings(req.user);
  }

  @Patch("branding-settings")
  updateBrandingSettings(
    @Req() req: StaffRequest,
    @Body() dto: UpdateRestaurantBrandingDto,
  ) {
    return this.restaurant.updateBrandingSettings(req.user, dto);
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

  @Delete("menu/:id")
  deleteMenu(@Req() req: StaffRequest, @Param("id") id: string) {
    return this.restaurant.deleteMenuItem(req.user, id);
  }

  @Get("inventory")
  inventory(@Req() req: StaffRequest) {
    return this.restaurant.inventory(req.user);
  }

  @Post("inventory/categories")
  addInventoryCategory(
    @Req() req: StaffRequest,
    @Body() dto: CreateInventoryCategoryDto,
  ) {
    return this.restaurant.addInventoryCategory(req.user, dto);
  }

  @Post("inventory/products")
  addInventoryProduct(
    @Req() req: StaffRequest,
    @Body() dto: CreateInventoryProductDto,
  ) {
    return this.restaurant.addInventoryProduct(req.user, dto);
  }

  @Patch("inventory/products/:id")
  updateInventoryProduct(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateInventoryProductDto,
  ) {
    return this.restaurant.updateInventoryProduct(req.user, id, dto);
  }

  @Post("inventory/products/:id/movements")
  addInventoryMovement(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: CreateInventoryMovementDto,
  ) {
    return this.restaurant.addInventoryMovement(req.user, id, dto);
  }

  @Post("inventory/products/:id/weighings")
  addLiquorWeighing(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: CreateLiquorWeighingDto,
  ) {
    return this.restaurant.addLiquorWeighing(req.user, id, dto);
  }

  @Patch("inventory/recipes/:menuItemId")
  saveInventoryRecipe(
    @Req() req: StaffRequest,
    @Param("menuItemId") menuItemId: string,
    @Body() dto: SaveInventoryRecipeDto,
  ) {
    return this.restaurant.saveInventoryRecipe(req.user, menuItemId, dto);
  }

  @Get("promotions")
  promotions(@Req() req: StaffRequest) {
    return this.restaurant.promotions(req.user);
  }

  @Get("loyalty/summary")
  loyaltySummary(@Req() req: StaffRequest) {
    return this.restaurant.loyaltySummary(req.user);
  }

  @Get("loyalty/rewards")
  rewardPrograms(@Req() req: StaffRequest) {
    return this.restaurant.rewardPrograms(req.user);
  }

  @Post("loyalty/rewards")
  addRewardProgram(
    @Req() req: StaffRequest,
    @Body() dto: CreateRewardProgramDto,
  ) {
    return this.restaurant.addRewardProgram(req.user, dto);
  }

  @Post("promotions")
  addPromotion(@Req() req: StaffRequest, @Body() dto: CreatePromotionDto) {
    return this.restaurant.addPromotion(req.user, dto);
  }

  @Patch("promotions/:id")
  updatePromotion(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.restaurant.updatePromotion(req.user, id, dto);
  }

  @Get("invoice-requests")
  invoiceRequests(@Req() req: StaffRequest) {
    return this.restaurant.invoiceRequests(req.user);
  }

  @Patch("invoice-requests/:id")
  updateInvoiceRequest(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateInvoiceRequestDto,
  ) {
    return this.restaurant.updateInvoiceRequest(req.user, id, dto);
  }

  @Get("orders")
  orders(@Req() req: StaffRequest) {
    return this.restaurant.orders(req.user);
  }

  @Get("order-entry")
  orderEntry(@Req() req: StaffRequest) {
    return this.restaurant.staffOrderEntry(req.user);
  }

  @Post("orders")
  createStaffOrder(
    @Req() req: StaffRequest,
    @Body() dto: CreateStaffOrderDto,
  ) {
    return this.restaurant.createStaffOrder(req.user, dto);
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

  @Patch("items/:id/handoff")
  handoff(@Req() req: StaffRequest, @Param("id") id: string) {
    return this.restaurant.handoffItem(req.user, id);
  }

  @Patch("orders/:id/correction-request/acknowledge")
  acknowledgeCorrectionRequest(
    @Req() req: StaffRequest,
    @Param("id") id: string,
  ) {
    return this.restaurant.acknowledgeCorrectionRequest(req.user, id);
  }

  @Patch("orders/:id/correction")
  correctOrder(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: CorrectStaffOrderDto,
  ) {
    return this.restaurant.correctStaffOrder(req.user, id, dto);
  }

  @Patch("items/:id/fulfillment")
  fulfillment(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateItemFulfillmentDto,
  ) {
    return this.restaurant.updateItemFulfillment(req.user, id, dto);
  }

  @Get("staff-users")
  staffUsers(@Req() req: StaffRequest) {
    return this.restaurant.restaurantUsers(req.user);
  }

  @Get("staff-hours")
  staffHours(
    @Req() req: StaffRequest,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("userId") userId?: string,
  ) {
    return this.restaurant.staffHours(req.user, from, to, userId);
  }

  @Patch("staff-users/:id/role")
  updateRestaurantRole(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateRestaurantRoleDto,
  ) {
    return this.restaurant.updateRestaurantRole(req.user, id, dto.role ?? null);
  }

  @Patch("staff-users/:id/cash-authorization")
  updateCashAuthorization(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateCashAuthorizationDto,
  ) {
    return this.cash.updateAuthorization(req.user, id, dto.authorized);
  }

  @Patch("staff-users/:id/availability")
  updateStaffAvailability(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateStaffAvailabilityDto,
  ) {
    return this.restaurant.updateStaffAvailability(req.user, id, dto);
  }

  @Patch("staff-users/:id/payroll")
  updateStaffPayroll(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateStaffPayrollDto,
  ) {
    return this.restaurant.updateStaffPayroll(req.user, id, dto);
  }

  @Post("staff-users/:id/access-qr")
  generateStaffAccessQr(@Req() req: StaffRequest, @Param("id") id: string) {
    this.requireRestaurantAdministrator(req.user);
    return this.users.generateStaffAccessQr(
      req.user.organizationId,
      req.user.id,
      id,
    );
  }

  @Delete("staff-users/:id/access-qr")
  revokeStaffAccessQr(@Req() req: StaffRequest, @Param("id") id: string) {
    this.requireRestaurantAdministrator(req.user);
    return this.users.revokeStaffAccessQr(
      req.user.organizationId,
      req.user.id,
      id,
    );
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
  closeVisit(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: CloseVisitDto,
  ) {
    return this.restaurant.closeVisit(
      req.user,
      id,
      dto.paymentMethod,
      dto.paymentReference,
    );
  }

  @Patch("visits/:id/payment")
  updateVisitPayment(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: UpdateVisitPaymentDto,
  ) {
    return this.restaurant.updateVisitPayment(req.user, id, dto.status);
  }

  @Patch("visits/:id/delivery-handoff")
  handoffDelivery(@Req() req: StaffRequest, @Param("id") id: string) {
    return this.restaurant.handoffDelivery(req.user, id);
  }

  @Patch("visits/:id/transfer")
  transferVisit(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() dto: TransferVisitDto,
  ) {
    return this.restaurant.transferVisit(req.user, id, dto.destinationTableId);
  }
}
