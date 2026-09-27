import { IsString, MaxLength, MinLength } from "class-validator";

export class StaffAccessLoginDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  accessCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
