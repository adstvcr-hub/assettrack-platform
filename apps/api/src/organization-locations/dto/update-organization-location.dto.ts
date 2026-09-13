import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
} from "class-validator";
import { OrganizationLocationType } from "../../generated/prisma/enums";

export class UpdateOrganizationLocationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(OrganizationLocationType)
  type?: OrganizationLocationType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  @IsTimeZone()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}