import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class UpdateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;
}
