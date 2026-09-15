import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeLocationName } from "../common/normalize-location-name";
import { CreateOrganizationLocationDto } from "./dto/create-organization-location.dto";
import { UpdateOrganizationLocationDto } from "./dto/update-organization-location.dto";

@Injectable()
export class OrganizationLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  private handlePrismaError(error: unknown): never {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ConflictException(
        "An organization location with this name already exists",
      );
    }

    throw error;
  }

  async create(organizationId: string, dto: CreateOrganizationLocationDto) {
    try {
      return await this.prisma.organizationLocation.create({
        data: {
          organizationId,
          name: dto.name,
          nameKey: normalizeLocationName(dto.name),
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
    } catch (error) {
      this.handlePrismaError(error);
    }
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

    try {
      return await this.prisma.organizationLocation.update({
        where: {
          id,
        },
        data: {
         name: dto.name,
nameKey:
  dto.name !== undefined
    ? normalizeLocationName(dto.name)
    : undefined,
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
    } catch (error) {
      this.handlePrismaError(error);
    }
  }
}
