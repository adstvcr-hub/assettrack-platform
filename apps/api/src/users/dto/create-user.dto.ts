import { IsEmail, IsEnum, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { UserRole } from '../../generated/prisma/enums';

export class CreateUserDto {
  @IsUUID()
  organizationId!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEnum(UserRole)
  role: UserRole = UserRole.USER;
}
