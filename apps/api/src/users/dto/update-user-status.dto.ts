import { IsBoolean } from "class-validator";

export class UpdateUserStatusDto {
  @IsBoolean()
  active!: boolean;
}
