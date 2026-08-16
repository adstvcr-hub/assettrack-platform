import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateForAsset(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { qrCode: true },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.qrCode) {
      return asset.qrCode;
    }

    const code = `ATQR-${asset.id.slice(0, 8).toUpperCase()}`;

    return this.prisma.qrCode.create({
      data: {
        assetId,
        code,
      },
    });
  }
}