import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { UpdateAssetDto } from "./dto/update-asset.dto";

@Injectable()
export class AssetsService {
  async update(organizationId: string, id: string, dto: UpdateAssetDto) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    return this.prisma.asset.update({
      where: { id },
      data: {
        name: dto.name,
        assetTag: dto.assetTag,
        description: dto.description,
        status: dto.status,
        location: dto.location,
      },
    });
  }
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateAssetDto) {
    return this.prisma.asset.create({
      data: {
        organizationId,
        name: dto.name,
        assetTag: dto.assetTag,
        description: dto.description,
        status: dto.status,
        location: dto.location,
      },
    });
  }

  findAll(organizationId: string, page = 1, limit = 25) {
    return this.prisma.asset.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findOne(organizationId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    return asset;
  }
}
