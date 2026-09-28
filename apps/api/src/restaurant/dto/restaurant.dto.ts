import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  RestaurantCourse,
  RestaurantItemStatus,
  RestaurantFulfillment,
  RestaurantInvoiceRequestStatus,
  RestaurantProductOrigin,
  RestaurantPayPeriod,
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  RestaurantStation,
  RestaurantTableKind,
  RestaurantRewardType,
} from "../../generated/prisma/enums";

export class CreateTableDto {
  @IsString() @MaxLength(60) name!: string;
  @IsOptional() @IsEnum(RestaurantTableKind) kind?: RestaurantTableKind;
}

export class CreateMenuItemDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsInt() @Min(0) @Max(10000000) price!: number;
  @IsEnum(RestaurantStation) station!: RestaurantStation;
  @IsEnum(RestaurantCourse) course!: RestaurantCourse;
  @IsString() @MaxLength(60) productType!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
  @IsEnum(RestaurantProductOrigin) origin!: RestaurantProductOrigin;
  @IsOptional() @IsInt() @Min(5) @Max(15) prepMinutes?: number;
  @IsOptional() @IsBoolean() alcoholic?: boolean;
  @IsOptional() @IsString() @MaxLength(2800000) imageData?: string;
}

export class UpdateMenuItemDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000000) price?: number;
  @IsOptional() @IsEnum(RestaurantStation) station?: RestaurantStation;
  @IsOptional() @IsEnum(RestaurantCourse) course?: RestaurantCourse;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MaxLength(60) productType?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
  @IsOptional()
  @IsEnum(RestaurantProductOrigin)
  origin?: RestaurantProductOrigin;
  @IsOptional() @IsInt() @Min(5) @Max(15) prepMinutes?: number | null;
  @IsOptional() @IsBoolean() alcoholic?: boolean;
  @IsOptional() @IsString() @MaxLength(2800000) imageData?: string | null;
}

export class OrderLineDto {
  @IsUUID() menuItemId!: string;
  @IsInt() @Min(1) @Max(10) quantity!: number;
  @IsOptional()
  @IsEnum(RestaurantFulfillment)
  fulfillment?: RestaurantFulfillment;
}

export class PlaceOrderDto {
  @IsUUID()
  requestId!: string;

  @IsOptional()
  @IsUUID()
  accountAccessCode?: string;

  @IsOptional()
  @IsEnum(RestaurantFulfillment)
  fulfillment?: RestaurantFulfillment;

  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) locationAccuracy?: number;
  @IsOptional() @IsString() @MaxLength(40) deliveryPhone?: string;
  @IsOptional() @IsString() @MaxLength(500) deliveryAddress?: string;

  @IsOptional()
  @IsUUID()
  promotionId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];
}

export class RecordQrAccessDto {
  @IsUUID() sessionKey!: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) accuracy?: number;
}

export class UpdateItemStatusDto {
  @IsEnum(RestaurantItemStatus) status!: RestaurantItemStatus;
}

export class UpdateItemFulfillmentDto {
  @IsEnum(RestaurantFulfillment) fulfillment!: RestaurantFulfillment;
  @IsOptional() @IsString() @MaxLength(240) reason?: string;
}

export class UpdateRestaurantRoleDto {
  @IsOptional()
  @IsEnum(RestaurantStaffRole)
  role!: RestaurantStaffRole | null;
}

export class AssignWaiterDto {
  @IsOptional()
  @IsUUID()
  waiterId!: string | null;
}

export class UpdateTableBillingDto {
  @IsBoolean()
  serviceChargeEnabled!: boolean;
}

export class UpdateRestaurantBillingDto {
  @IsInt() @Min(0) @Max(10000) taxRateBps!: number;
  @IsBoolean() taxIncluded!: boolean;
  @IsInt() @Min(0) @Max(10000) serviceRateBps!: number;
}

export class UpdateRestaurantOrderingAreaDto {
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsInt() @Min(25) @Max(5000) radiusMeters!: number;
}

export class UpdateVisitPaymentDto {
  @IsIn(["CONFIRMED", "REJECTED"])
  status!: "CONFIRMED" | "REJECTED";
}

export class UpdateRestaurantBrandingDto {
  @IsOptional() @IsString() @MaxLength(120) displayName?: string | null;
  @IsBoolean() useHeaderImage!: boolean;
  @IsOptional()
  @IsString()
  @MaxLength(2800000)
  headerImageData?: string | null;
  @IsBoolean() menuBackgroundEnabled!: boolean;
  @IsOptional()
  @IsString()
  @MaxLength(2800000)
  menuBackgroundImageData?: string | null;
  @IsIn(["center", "top", "bottom"])
  menuBackgroundPosition!: "center" | "top" | "bottom";
  @IsIn(["cover", "contain"])
  menuBackgroundSize!: "cover" | "contain";
}

export class UpdateStaffAvailabilityDto {
  @IsEnum(RestaurantStaffAvailability)
  availability!: RestaurantStaffAvailability;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) locationAccuracy?: number;
}

export class UpdateStaffPayrollDto {
  @IsEnum(RestaurantPayPeriod)
  payPeriod!: RestaurantPayPeriod;

  @IsInt() @Min(0) @Max(100000000) payRate!: number;
  @IsInt() @Min(60) @Max(1440) standardMinutesPerDay!: number;
  @IsInt() @Min(1) @Max(31) workDaysPerMonth!: number;
  @IsBoolean() ccssDeductionEnabled!: boolean;
  @IsInt() @Min(0) @Max(10000) ccssDeductionBps!: number;
}

export class CancelOrderDto {
  @IsString()
  @MaxLength(240)
  reason!: string;
}

export class RequestInvoiceDto {
  @IsString() @MaxLength(120) name!: string;
  @IsEmail() @MaxLength(160) email!: string;
  @IsString() @MaxLength(40) phone!: string;
  @IsString() @MaxLength(40) taxId!: string;
}

export class UpdateInvoiceRequestDto {
  @IsEnum(RestaurantInvoiceRequestStatus)
  status!: RestaurantInvoiceRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

export class CreatePromotionDto {
  @IsString() @MaxLength(100) title!: string;
  @IsOptional() @IsString() @MaxLength(60) productType?: string;
  @IsOptional() @IsUUID() menuItemId?: string;
  @IsInt() @Min(0) @Max(10000000) creditAmount!: number;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
}

export class UpdatePromotionDto {
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsString() @MaxLength(60) productType?: string | null;
  @IsOptional() @IsUUID() menuItemId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(10000000) creditAmount?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class JoinLoyaltyDto {
  @IsString() @MaxLength(60) nickname!: string;
  @IsEmail() @MaxLength(160) email!: string;
  @IsBoolean() marketingOptIn!: boolean;
}

export class CreateRewardProgramDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsInt() @Min(1) @Max(1000000) pointsRequired!: number;
  @IsOptional() @IsEnum(RestaurantRewardType) rewardType?: RestaurantRewardType;
  @IsOptional() @IsUUID() menuItemId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10000) discountBps?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000000) maxDiscountAmount?: number;
  @IsOptional() @IsString() @MaxLength(40) vipTier?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}

export class TransferVisitDto {
  @IsUUID() destinationTableId!: string;
}
