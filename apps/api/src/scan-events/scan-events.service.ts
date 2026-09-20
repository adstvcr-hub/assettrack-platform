import { Injectable, NotFoundException } from "@nestjs/common";
import tzlookup from "@photostructure/tz-lookup";
import { PrismaService } from "../prisma/prisma.service";
import { CreateScanEventDto } from "./dto/create-scan-event.dto";
import {
  getTimezoneOffsetMinutes,
  getUtcDateRangeForLocalDate,
} from "../common/timezone-date-range";
import { LocationSource } from "../generated/prisma/enums";

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
      throw new NotFoundException("Asset not found");
    }
    let resolvedTimezone = dto.timezone;

    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      try {
        resolvedTimezone = tzlookup(dto.latitude, dto.longitude);
      } catch (error) {
        console.warn("Unable to resolve timezone from scan coordinates", error);
      }
    }

    const scannedAt = new Date();

    const resolvedTimezoneOffset = getTimezoneOffsetMinutes(
      scannedAt,
      resolvedTimezone,
    );
    return this.prisma.scanEvent.create({
      data: {
        assetId: dto.assetId,
        userId: authenticatedUserId,
        notes: dto.notes,
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationAccuracy: dto.locationAccuracy,
        scannedAt,
        timezone: resolvedTimezone,
        timezoneOffset: resolvedTimezoneOffset,
      },
    });
  }

  async findAll(
    organizationId: string,
    page = 1,
    limit = 25,
    search?: string,
    assetId?: string,
    userId?: string,
    locationSource?: LocationSource,
    date?: string,
    timezone?: string,
  ) {
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (date) {
      const range = getUtcDateRangeForLocalDate(date, timezone);

      startDate = range.start;
      endDate = range.end;
    }

    const where = {
      asset: {
        organizationId,
      },

      ...(assetId
        ? {
            assetId,
          }
        : {}),

      ...(userId
        ? {
            userId,
          }
        : {}),

      ...(locationSource
        ? {
            locationSource,
          }
        : {}),

      ...(date
        ? {
            scannedAt: {
              gte: startDate,
              lt: endDate,
            },
          }
        : {}),

      ...(search
        ? {
            OR: [
              {
                notes: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                asset: {
                  organizationId,
                  name: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                asset: {
                  organizationId,
                  assetTag: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                user: {
                  name: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                user: {
                  email: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                locationName: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                country: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                region: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                city: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                address: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.scanEvent.findMany({
        where,
        orderBy: {
          scannedAt: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
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
      }),

      this.prisma.scanEvent.count({
        where,
      }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
