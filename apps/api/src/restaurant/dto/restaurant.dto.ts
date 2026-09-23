import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
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
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  RestaurantStation,
} from "../../generated/prisma/enums";

export class CreateTableDto {
  @IsString() @MaxLength(60) name!: string;
}

export class CreateMenuItemDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsInt() @Min(0) @Max(10000000) price!: number;
  @IsEnum(RestaurantStation) station!: RestaurantStation;
  @IsEnum(RestaurantCourse) course!: RestaurantCourse;
}

export class UpdateMenuItemDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000000) price?: number;
  @IsOptional() @IsEnum(RestaurantStation) station?: RestaurantStation;
  @IsOptional() @IsEnum(RestaurantCourse) course?: RestaurantCourse;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class OrderLineDto {
  @IsUUID() menuItemId!: string;
  @IsInt() @Min(1) @Max(10) quantity!: number;
}

export class PlaceOrderDto {
  @IsUUID()
  requestId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];
}

export class UpdateItemStatusDto {
  @IsEnum(RestaurantItemStatus) status!: RestaurantItemStatus;
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

export class UpdateStaffAvailabilityDto {
  @IsEnum(RestaurantStaffAvailability)
  availability!: RestaurantStaffAvailability;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}

export class CancelOrderDto {
  @IsString()
  @MaxLength(240)
  reason!: string;
}
