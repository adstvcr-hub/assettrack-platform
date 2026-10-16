import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import {
  OrganizationLocationType,
  RestaurantRewardSponsor,
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  UserRole,
} from "../generated/prisma/enums";
import { CreateRewardProgramDto } from "../restaurant/dto/restaurant.dto";
import { normalizeLocationName } from "../common/normalize-location-name";
import { CreateRestaurantOrganizationDto } from "./dto/platform-admin.dto";
import { RestaurantDataLifecycleService } from "../restaurant/restaurant-data-lifecycle.service";

export type PlatformActor = { id: string; email: string };

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle?: RestaurantDataLifecycleService,
  ) {}

  requirePlatformAdmin(actor: PlatformActor) {
    const configured = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (!configured.includes(actor.email.toLowerCase())) {
      throw new ForbiddenException(
        "AssetTrack platform administrator access required",
      );
    }
  }

  profile(actor: PlatformActor) {
    this.requirePlatformAdmin(actor);
    return { platformAdmin: true, email: actor.email };
  }

  async organizations(actor: PlatformActor) {
    this.requirePlatformAdmin(actor);
    return this.prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        restaurantAccessEnabled: true,
        restaurantRetentionDays: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            restaurantTables: true,
            restaurantOrders: true,
            restaurantVisits: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async createRestaurantOrganization(
    actor: PlatformActor,
    dto: CreateRestaurantOrganizationDto,
  ) {
    this.requirePlatformAdmin(actor);
    const slug = dto.slug.trim().toLowerCase();
    const existing = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("Organization slug already exists");
    }

    const temporaryPassword = `At-${randomBytes(9).toString("base64url")}!`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            name: dto.name.trim(),
            slug,
            restaurantAccessEnabled: dto.enabled,
            restaurantDisplayName: dto.name.trim(),
          },
          select: {
            id: true,
            name: true,
            slug: true,
            restaurantAccessEnabled: true,
          },
        });
        const administrator = await tx.user.create({
          data: {
            organizationId: organization.id,
            name: dto.adminName.trim(),
            email: dto.adminEmail.trim().toLowerCase(),
            passwordHash,
            role: UserRole.OWNER,
            restaurantRole: RestaurantStaffRole.RESTAURANT_ADMIN,
            restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
          },
          select: { id: true, name: true, email: true },
        });
        await tx.organizationLocation.create({
          data: {
            organizationId: organization.id,
            name: dto.name.trim(),
            nameKey: normalizeLocationName(dto.name),
            type: OrganizationLocationType.BRANCH,
            country: dto.country.trim(),
            region: dto.region?.trim() || null,
            city: dto.city?.trim() || null,
            timezone: dto.timezone?.trim() || null,
            active: true,
          },
        });
        await tx.platformAdminEvent.create({
          data: {
            actorId: actor.id,
            action: "RESTAURANT_ORGANIZATION_CREATED",
            organizationId: organization.id,
            targetUserId: administrator.id,
            metadata: {
              slug: organization.slug,
              enabled: organization.restaurantAccessEnabled,
            },
          },
        });
        return { organization, administrator };
      });
      return { ...created, temporaryPassword };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Organization slug already exists");
      }
      throw error;
    }
  }

  async organizationUsers(actor: PlatformActor, organizationId: string) {
    this.requirePlatformAdmin(actor);
    return this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        restaurantRole: true,
        restaurantAvailability: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async overview(actor: PlatformActor, from?: string, to?: string) {
    this.requirePlatformAdmin(actor);
    await this.lifecycle?.consolidatePending();
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 86400000);
    const toDate = to ? new Date(to) : new Date();
    if (
      Number.isNaN(fromDate.getTime()) ||
      Number.isNaN(toDate.getTime()) ||
      fromDate >= toDate
    ) {
      throw new BadRequestException("Invalid date range");
    }
    const dateRange = {
      gte: fromDate.toISOString().slice(0, 10),
      lte: toDate.toISOString().slice(0, 10),
    };
    const [organizations, analytics, loyalty, locations] = await Promise.all([
      this.prisma.organization.count({
        where: { restaurantAccessEnabled: true },
      }),
      this.prisma.restaurantAnalyticsDaily.findMany({
        where: { date: dateRange },
        select: {
          organizationId: true,
          date: true,
          orders: true,
          visitsOpened: true,
          subtotal: true,
          organization: { select: { name: true } },
        },
      }),
      this.prisma.restaurantLoyaltyActivity.findMany({
        where: {
          createdAt: { gte: fromDate, lt: toDate },
          type: "VISIT_COMPLETED",
        },
        select: { memberId: true, organizationId: true },
      }),
      this.prisma.organizationLocation.findMany({
        where: { active: true },
        select: {
          organizationId: true,
          country: true,
          region: true,
          city: true,
        },
      }),
    ]);
    const restaurants = new Map<
      string,
      { name: string; orders: number; sales: number }
    >();
    const demand = new Map<string, number>();
    let globalSales = 0;
    let orders = 0;
    let visits = 0;
    for (const entry of analytics) {
      const current = restaurants.get(entry.organizationId) ?? {
        name: entry.organization.name,
        orders: 0,
        sales: 0,
      };
      current.orders += entry.orders;
      current.sales += entry.subtotal;
      restaurants.set(entry.organizationId, current);
      orders += entry.orders;
      visits += entry.visitsOpened;
      globalSales += entry.subtotal;
      demand.set(entry.date, (demand.get(entry.date) ?? 0) + entry.orders);
    }
    const geography = new Map<string, Set<string>>();
    for (const location of locations) {
      const key = [location.country, location.region, location.city]
        .filter(Boolean)
        .join(" / ");
      const ids = geography.get(key) ?? new Set<string>();
      ids.add(location.organizationId);
      geography.set(key, ids);
    }
    const memberVisits = new Map<string, number>();
    for (const activity of loyalty) {
      memberVisits.set(
        activity.memberId,
        (memberVisits.get(activity.memberId) ?? 0) + 1,
      );
    }
    return {
      range: { from: fromDate, to: toDate },
      organizations,
      orders,
      visits,
      globalSales,
      loyaltyMembers: memberVisits.size,
      frequentCustomers: [...memberVisits.values()].filter((count) => count > 1)
        .length,
      restaurants: [...restaurants.entries()]
        .map(([organizationId, value]) => ({ organizationId, ...value }))
        .sort((a, b) => b.sales - a.sales),
      geography: [...geography.entries()].map(([area, ids]) => ({
        area,
        restaurants: ids.size,
      })),
      demandPeaks: [...demand.entries()]
        .map(([period, count]) => ({ period, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      privacy: "Aggregated metrics only; scanner identity is not stored.",
    };
  }

  async setRestaurantRetention(
    actor: PlatformActor,
    organizationId: string,
    days: number,
  ) {
    this.requirePlatformAdmin(actor);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      throw new BadRequestException("Retention must be between 1 and 30 days");
    }
    const result = await this.prisma.organization.updateMany({
      where: { id: organizationId },
      data: { restaurantRetentionDays: days },
    });
    if (!result.count) throw new NotFoundException("Organization not found");
    await this.prisma.platformAdminEvent.create({
      data: {
        actorId: actor.id,
        action: "RESTAURANT_RETENTION_UPDATED",
        organizationId,
        metadata: { days, maximumDays: 30 },
      },
    });
    const maintenance = await this.lifecycle?.runMaintenance(organizationId);
    return {
      organizationId,
      restaurantRetentionDays: days,
      maximumDays: 30,
      maintenance: maintenance ?? null,
    };
  }

  async runDataMaintenance(actor: PlatformActor) {
    this.requirePlatformAdmin(actor);
    if (!this.lifecycle) {
      throw new ConflictException("Data maintenance service unavailable");
    }
    const result = await this.lifecycle.runMaintenance();
    await this.prisma.platformAdminEvent.create({
      data: {
        actorId: actor.id,
        action: "RESTAURANT_DATA_MAINTENANCE_RUN",
        metadata: result,
      },
    });
    return result;
  }

  async setRestaurantAccess(
    actor: PlatformActor,
    organizationId: string,
    enabled: boolean,
  ) {
    this.requirePlatformAdmin(actor);
    const result = await this.prisma.organization.updateMany({
      where: { id: organizationId },
      data: { restaurantAccessEnabled: enabled },
    });
    if (!result.count) throw new NotFoundException("Organization not found");
    await this.prisma.platformAdminEvent.create({
      data: {
        actorId: actor.id,
        action: enabled
          ? "RESTAURANT_ACCESS_ENABLED"
          : "RESTAURANT_ACCESS_SUSPENDED",
        organizationId,
      },
    });
    return { organizationId, restaurantAccessEnabled: enabled };
  }

  async resetCredential(
    actor: PlatformActor,
    organizationId: string,
    userId: string,
    reason: string,
  ) {
    this.requirePlatformAdmin(actor);
    if (!reason.trim()) throw new BadRequestException("Audit reason required");
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException("User not found");
    const temporaryPassword = `At-${randomBytes(8).toString("base64url")}!`;
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(temporaryPassword, 12),
          sessionVersion: { increment: 1 },
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.platformAdminEvent.create({
        data: {
          actorId: actor.id,
          action: "USER_CREDENTIAL_RESET",
          organizationId,
          targetUserId: user.id,
          reason: reason.trim(),
        },
      }),
    ]);
    return {
      userId: user.id,
      email: user.email,
      temporaryPassword,
      warning:
        "Shown once. Deliver through a verified channel and require a new password.",
    };
  }

  createAssetTrackReward(actor: PlatformActor, dto: CreateRewardProgramDto) {
    this.requirePlatformAdmin(actor);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException("Reward end must follow its start");
    }
    return this.prisma.restaurantRewardProgram.create({
      data: {
        organizationId: null,
        sponsor: RestaurantRewardSponsor.ASSETTRACK,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        pointsRequired: dto.pointsRequired,
        vipTier: dto.vipTier?.trim().toUpperCase() || null,
        startsAt,
        endsAt,
      },
    });
  }
}
