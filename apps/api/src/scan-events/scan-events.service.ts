import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateScanEventDto } from "./dto/create-scan-event.dto";
import { getUtcDateRangeForLocalDate } from "../common/timezone-date-range";

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

    return this.prisma.scanEvent.create({
      data: {
        assetId: dto.assetId,
        userId: authenticatedUserId,
        notes: dto.notes,
        latitude: dto.latitude,
        longitude: dto.longitude,
        locationAccuracy: dto.locationAccuracy,
        timezone: dto.timezone,
        timezoneOffset: dto.timezoneOffset,
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
