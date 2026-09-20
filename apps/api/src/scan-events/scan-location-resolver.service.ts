import { Injectable, NotFoundException } from "@nestjs/common";
import tzlookup from "@photostructure/tz-lookup";
import { getTimezoneOffsetMinutes } from "../common/timezone-date-range";
import { LocationSource } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import { ScanLocationDto } from "./dto/scan-location.dto";

@Injectable()
export class ScanLocationResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(organizationId: string, dto: ScanLocationDto) {
    let timezone = dto.timezone || "UTC";
    let latitude = dto.latitude;
    let longitude = dto.longitude;
    let organizationLocationId: string | undefined;
    let locationName = dto.locationName;
    let country = dto.country;
    let region = dto.region;
    let city = dto.city;
    let address = dto.address;
    let locationSource: LocationSource;

    if (latitude !== undefined && longitude !== undefined) {
      locationSource = LocationSource.GPS;
      timezone = this.resolveTimezone(latitude, longitude, timezone);
    } else if (dto.organizationLocationId) {
      const savedLocation = await this.prisma.organizationLocation.findFirst({
        where: {
          id: dto.organizationLocationId,
          organizationId,
          active: true,
        },
      });

      if (!savedLocation) {
        throw new NotFoundException("Organization location not found");
      }

      organizationLocationId = savedLocation.id;
      locationSource = LocationSource.ORGANIZATION_LOCATION;
      locationName = savedLocation.name;
      country = savedLocation.country;
      region = savedLocation.region ?? undefined;
      city = savedLocation.city ?? undefined;
      address = savedLocation.address ?? undefined;
      latitude =
        savedLocation.latitude !== null
          ? Number(savedLocation.latitude)
          : undefined;
      longitude =
        savedLocation.longitude !== null
          ? Number(savedLocation.longitude)
          : undefined;

      if (savedLocation.timezone) {
        timezone = savedLocation.timezone;
      } else if (latitude !== undefined && longitude !== undefined) {
        timezone = this.resolveTimezone(latitude, longitude, timezone);
      }
    } else if (
      dto.locationName ||
      dto.country ||
      dto.region ||
      dto.city ||
      dto.address
    ) {
      locationSource = LocationSource.MANUAL;
    } else if (dto.timezone) {
      locationSource = LocationSource.DEVICE_TIMEZONE;
    } else {
      locationSource = LocationSource.UTC_FALLBACK;
      timezone = "UTC";
    }

    const scannedAt = new Date();

    return {
      organizationLocationId,
      locationSource,
      locationName,
      country,
      region,
      city,
      address,
      latitude,
      longitude,
      locationAccuracy: dto.locationAccuracy,
      timezone,
      timezoneOffset: getTimezoneOffsetMinutes(scannedAt, timezone),
      scannedAt,
    };
  }

  private resolveTimezone(
    latitude: number,
    longitude: number,
    fallback: string,
  ) {
    try {
      return tzlookup(latitude, longitude);
    } catch (error) {
      console.warn("Unable to resolve timezone from scan coordinates", error);
      return fallback;
    }
  }
}
