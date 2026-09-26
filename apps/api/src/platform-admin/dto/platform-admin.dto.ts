import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateRestaurantOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must contain only lowercase letters, numbers, and hyphens",
  })
  slug!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  adminName!: string;

  @IsEmail()
  @MaxLength(160)
  adminEmail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country!: string;

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
  @IsTimeZone()
  @MaxLength(100)
  timezone?: string;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateRestaurantAccessDto {
  @IsBoolean()
  enabled!: boolean;
}

export class ResetUserCredentialDto {
  @IsString()
  @MaxLength(200)
  reason!: string;
}
