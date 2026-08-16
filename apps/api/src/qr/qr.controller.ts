import { Controller, Get, Param } from '@nestjs/common';
import { QrService } from './qr.service';

@Controller('assets')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Get(':id/qr')
  getQr(@Param('id') id: string) {
    return this.qrService.getOrCreateForAsset(id);
  }
}