import * as QRCode from 'qrcode';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) {}

async generatePngForAsset(assetId: string): Promise<Buffer> {
  const qr = await this.getOrCreateForAsset(assetId);

const webUrl =
  process.env.PUBLIC_WEB_URL ?? 'http://localhost:3001';

const payload = `${webUrl}/scan?code=${encodeURIComponent(qr.code)}`;

  return QRCode.toBuffer(payload, {
    type: 'png',
    width: 500,
    margin: 2,
  });
} 
 async generateImageForAsset(assetId: string) {
  const qr = await this.getOrCreateForAsset(assetId);

 const webUrl =
  process.env.PUBLIC_WEB_URL ?? 'http://localhost:3001';

const payload = `${webUrl}/scan?code=${encodeURIComponent(qr.code)}`;
  const dataUrl = await QRCode.toDataURL(payload);

  return {
    assetId,
    code: qr.code,
    payload,
    image: dataUrl,
  };
}

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