import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScanEventDto } from './dto/create-scan-event.dto';

@Injectable()
export class ScanEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    authenticatedUserId: string,
    dto: CreateScanEventDto,
  ) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: dto.assetId,
        organizationId,
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return this.prisma.scanEvent.create({
      data: {
        assetId: dto.assetId,
        userId: authenticatedUserId,
        notes: dto.notes,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
  }

  findAll(organizationId: string) {
    return this.prisma.scanEvent.findMany({
      where: {
        asset: {
          organizationId,
        },
      },
      orderBy: {
        scannedAt: 'desc',
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