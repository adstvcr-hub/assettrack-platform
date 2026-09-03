import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

export class AssetsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
