import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { QrService } from './qr.service';

@Controller('assets')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Get(':id/qr')
  getQr(@Param('id') id: string) {
    return this.qrService.getOrCreateForAsset(id);
  }

  @Get(':id/qr/image')
  getQrImage(@Param('id') id: string) {
    return this.qrService.generateImageForAsset(id);
  }

  @Get(':id/qr/png')
  async getQrPng(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const png = await this.qrService.generatePngForAsset(id);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="asset-${id}-qr.png"`,
    );

    res.send(png);
  }
}