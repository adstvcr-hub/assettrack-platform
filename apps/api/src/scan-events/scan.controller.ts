import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ScanByCodeDto } from './dto/scan-by-code.dto';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    organizationId: string;
    email: string;
    name: string;
    role: string;
  };
};

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

  @UseGuards(JwtAuthGuard)
  @Post(':code')
  async scan(
    @Param('code') code: string,
    @Body() dto: ScanByCodeDto,
    @Req() req: AuthenticatedRequest,
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

    // Multi-tenant security boundary:
    // users may only scan assets belonging to their organization.
    if (qr.asset.organizationId !== req.user.organizationId) {
      throw new NotFoundException('QR code not found');
    }

    return this.prisma.scanEvent.create({
      data: {
        assetId: qr.assetId,
        userId: req.user.id,
        notes: dto.notes,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      include: {
        asset: true,
        user: {
          select: {
            id: true,
            organizationId: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }
}