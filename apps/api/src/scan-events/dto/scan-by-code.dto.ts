import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsTimeZone,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class ScanByCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  locationAccuracy?: number;

  @IsOptional()
  @IsString()
  @IsTimeZone()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsInt()
  timezoneOffset?: number;
}
