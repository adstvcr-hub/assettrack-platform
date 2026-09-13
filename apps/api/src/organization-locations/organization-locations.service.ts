import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrganizationLocationDto } from "./dto/create-organization-location.dto";
import { UpdateOrganizationLocationDto } from "./dto/update-organization-location.dto";

@Injectable()
export class OrganizationLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateOrganizationLocationDto) {
    return this.prisma.organizationLocation.create({
      data: {
        organizationId,
        name: dto.name,
        type: dto.type,
        country: dto.country,
        region: dto.region,
        city: dto.city,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        timezone: dto.timezone,
        active: dto.active,
      },
    });
  }

  findAll(organizationId: string) {
    return this.prisma.organizationLocation.findMany({
      where: {
        organizationId,
      },
      orderBy: [
        {
          active: "desc",
        },
        {
          name: "asc",
        },
      ],
    });
  }

  async findOne(organizationId: string, id: string) {
    const location = await this.prisma.organizationLocation.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!location) {
      throw new NotFoundException("Organization location not found");
    }

    return location;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateOrganizationLocationDto,
  ) {
    await this.findOne(organizationId, id);

    return this.prisma.organizationLocation.update({
      where: {
        id,
      },
      data: {
        name: dto.name,
        type: dto.type,
        country: dto.country,
        region: dto.region,
        city: dto.city,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        timezone: dto.timezone,
        active: dto.active,
      },
    });
  }
}