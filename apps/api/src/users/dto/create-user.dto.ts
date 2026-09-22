import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { RestaurantStaffRole, UserRole } from "../../generated/prisma/enums";

export class CreateUserDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsEnum(UserRole)
  role: UserRole = UserRole.USER;

  @IsOptional()
  @IsEnum(RestaurantStaffRole)
  restaurantRole?: RestaurantStaffRole;
}
