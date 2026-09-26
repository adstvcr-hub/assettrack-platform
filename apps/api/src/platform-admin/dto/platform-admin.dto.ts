import { IsBoolean, IsString, MaxLength } from "class-validator";

export class UpdateRestaurantAccessDto {
  @IsBoolean()
  enabled!: boolean;
}

export class ResetUserCredentialDto {
  @IsString()
  @MaxLength(200)
  reason!: string;
}
