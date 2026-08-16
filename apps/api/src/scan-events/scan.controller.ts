import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('scan')
export class ScanController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':code')
  async resolve(@Param('code') code: string) {
    const qr = await this.prisma.qrCode.findUnique({
      where: { code },
      include: {
        asset: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!qr) {
      throw new NotFoundException('QR code not found');
    }

    return {
      qrCode: qr.code,
      asset: qr.asset,
    };
  }
}