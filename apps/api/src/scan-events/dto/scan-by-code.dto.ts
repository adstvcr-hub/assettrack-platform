import { IsOptional, IsString, MaxLength } from "class-validator";
import { ScanLocationDto } from "./scan-location.dto";

export class ScanByCodeDto extends ScanLocationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
