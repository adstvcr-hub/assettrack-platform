import {
  IsNumber,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateScanEventDto {
  @IsUUID()
  assetId!: string;

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
}
