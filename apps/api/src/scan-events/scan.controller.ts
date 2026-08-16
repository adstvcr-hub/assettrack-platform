import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScanByCodeDto } from './dto/scan-by-code.dto';

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

  @Post(':code')
  async scan(
    @Param('code') code: string,
    @Body() dto: ScanByCodeDto,
  ) {
    const qr = await this.prisma.qrCode.findUnique({
      where: { code },
      include: {
        asset: true,
      },
    });

    if (!qr) {
      throw new NotFoundException('QR code not found');
    }

    if (dto.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }
    }

    return this.prisma.scanEvent.create({
      data: {
        assetId: qr.assetId,
        userId: dto.userId,
        notes: dto.notes,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      include: {
        asset: true,
        user: true,
      },
    });
  }
}