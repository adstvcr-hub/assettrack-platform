import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateScanEventDto } from "./dto/create-scan-event.dto";

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
      let effectiveTimezone = timezone || "UTC";

      try {
        new Intl.DateTimeFormat("en-US", {
          timeZone: effectiveTimezone,
        }).format();
      } catch {
        effectiveTimezone = "UTC";
      }

      const getUtcForLocalTime = (
        localDate: string,
        hour: number,
        minute = 0,
        second = 0,
        millisecond = 0,
      ) => {
        const [year, month, day] = localDate.split("-").map(Number);

        const utcGuess = new Date(
          Date.UTC(year, month - 1, day, hour, minute, second, millisecond),
        );

        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: effectiveTimezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).formatToParts(utcGuess);

        const values = Object.fromEntries(
          parts
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value]),
        );

        const interpretedAsUtc = Date.UTC(
          Number(values.year),
          Number(values.month) - 1,
          Number(values.day),
          Number(values.hour),
          Number(values.minute),
          Number(values.second),
        );

        const offset = interpretedAsUtc - utcGuess.getTime();

        return new Date(utcGuess.getTime() - offset);
      };

      startDate = getUtcForLocalTime(date, 0, 0, 0, 0);

      const nextDay = new Date(`${date}T00:00:00.000Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      const nextDayString = nextDay.toISOString().slice(0, 10);

      endDate = getUtcForLocalTime(nextDayString, 0, 0, 0, 0);
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
