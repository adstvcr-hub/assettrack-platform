import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { ScanLocationDto } from "./scan-location.dto";

export class CreateScanEventDto extends ScanLocationDto {
  @IsUUID()
  assetId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
