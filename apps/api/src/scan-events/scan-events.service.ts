import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScanEventDto } from './dto/create-scan-event.dto';

@Injectable()
export class ScanEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateScanEventDto) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: dto.assetId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
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
        assetId: dto.assetId,
        userId: dto.userId,
        notes: dto.notes,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
  }

  findAll() {
    return this.prisma.scanEvent.findMany({
      orderBy: {
        scannedAt: 'desc',
      },
      include: {
        asset: true,
        user: true,
      },
    });
  }
}