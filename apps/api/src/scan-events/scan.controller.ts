import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { ScanByCodeDto } from "./dto/scan-by-code.dto";
import { Throttle } from "@nestjs/throttler";
import tzlookup from "@photostructure/tz-lookup";
import { getTimezoneOffsetMinutes } from "../common/timezone-date-range";

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    organizationId: string;
    email: string;
    name: string;
    role: string;
  };
};

@Controller("scan")
export class ScanController {
  constructor(private readonly prisma: PrismaService) {}

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(":code")
  async resolve(@Param("code") code: string) {
    const qr = await this.prisma.qrCode.findUnique({
      where: { code },
      include: {
        asset: {
          select: {
            id: true,
            name: true,
            assetTag: true,
            status: true,
            organization: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!qr) {
      throw new NotFoundException("QR code not found");
    }

    return {
      qrCode: qr.code,
      asset: qr.asset,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post(":code")
  async scan(
    @Param("code") code: string,
    @Body() dto: ScanByCodeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const qr = await this.prisma.qrCode.findUnique({
      where: { code },
      include: {
        asset: true,
      },
    });

    if (!qr) {
      throw new NotFoundException("QR code not found");
    }

    // Multi-tenant security boundary:
    // users may only scan assets belonging to their organization.
    if (qr.asset.organizationId !== req.user.organizationId) {
      throw new NotFoundException("QR code not found");
    }

    let resolvedTimezone = dto.timezone || "UTC";
    let resolvedLatitude = dto.latitude;
    let resolvedLongitude = dto.longitude;
    let resolvedLocationAccuracy = dto.locationAccuracy;

    let organizationLocationId: string | undefined;
    let locationName = dto.locationName;
    let country = dto.country;
    let region = dto.region;
    let city = dto.city;
    let address = dto.address;

    let locationSource:
      | "GPS"
      | "ORGANIZATION_LOCATION"
      | "MANUAL"
      | "DEVICE_TIMEZONE"
      | "UTC_FALLBACK";

    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      locationSource = "GPS";

      try {
        resolvedTimezone = tzlookup(dto.latitude, dto.longitude);
      } catch (error) {
        console.warn("Unable to resolve timezone from scan coordinates", error);
      }
    } else if (dto.organizationLocationId) {
      const organizationLocation =
        await this.prisma.organizationLocation.findFirst({
          where: {
            id: dto.organizationLocationId,
            organizationId: req.user.organizationId,
            active: true,
          },
        });

      if (!organizationLocation) {
        throw new NotFoundException("Organization location not found");
      }

      organizationLocationId = organizationLocation.id;
      locationSource = "ORGANIZATION_LOCATION";

      locationName = organizationLocation.name;
      country = organizationLocation.country;
      region = organizationLocation.region ?? undefined;
      city = organizationLocation.city ?? undefined;
      address = organizationLocation.address ?? undefined;

      resolvedLatitude =
        organizationLocation.latitude !== null
          ? Number(organizationLocation.latitude)
          : undefined;

      resolvedLongitude =
        organizationLocation.longitude !== null
          ? Number(organizationLocation.longitude)
          : undefined;

      if (organizationLocation.timezone) {
        resolvedTimezone = organizationLocation.timezone;
      } else if (
        resolvedLatitude !== undefined &&
        resolvedLongitude !== undefined
      ) {
        try {
          resolvedTimezone = tzlookup(resolvedLatitude, resolvedLongitude);
        } catch (error) {
          console.warn(
            "Unable to resolve timezone from organization location",
            error,
          );
        }
      }
    } else if (
      dto.locationName ||
      dto.country ||
      dto.region ||
      dto.city ||
      dto.address
    ) {
      locationSource = "MANUAL";
    } else if (dto.timezone) {
      locationSource = "DEVICE_TIMEZONE";
    } else {
      locationSource = "UTC_FALLBACK";
      resolvedTimezone = "UTC";
    }

    const scannedAt = new Date();

    const resolvedTimezoneOffset = getTimezoneOffsetMinutes(
      scannedAt,
      resolvedTimezone,
    );

    return this.prisma.scanEvent.create({
      data: {
        assetId: qr.assetId,
        userId: req.user.id,
        scannedAt,
        notes: dto.notes,

        organizationLocationId,
        locationSource,

        locationName,
        country,
        region,
        city,
        address,

        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        locationAccuracy: resolvedLocationAccuracy,
        timezone: resolvedTimezone,
        timezoneOffset: resolvedTimezoneOffset,
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
