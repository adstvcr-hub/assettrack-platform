import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import type { StaffAccessLocationDto } from "./dto/staff-access-login.dto";
import {
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  UserRole,
} from "../generated/prisma/enums";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private generateRefreshToken() {
    return randomBytes(48).toString("hex");
  }

  private getRefreshTokenExpiry() {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    return expiresAt;
  }

  private distanceMeters(
    latitudeA: number,
    longitudeA: number,
    latitudeB: number,
    longitudeB: number,
  ) {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(latitudeB - latitudeA);
    const longitudeDelta = radians(longitudeB - longitudeA);
    const a =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(latitudeA)) *
        Math.cos(radians(latitudeB)) *
        Math.sin(longitudeDelta / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private isOperationalRestaurantStaff(user: {
    restaurantRole: string | null;
  }) {
    return (
      user.restaurantRole === RestaurantStaffRole.KITCHEN ||
      user.restaurantRole === RestaurantStaffRole.BAR ||
      user.restaurantRole === RestaurantStaffRole.WAITER
    );
  }

  private restaurantLocationRequired(user: {
    restaurantRole: string | null;
    organization: {
      restaurantLatitude: unknown;
      restaurantLongitude: unknown;
    };
  }) {
    return (
      this.isOperationalRestaurantStaff(user) &&
      user.organization.restaurantLatitude != null &&
      user.organization.restaurantLongitude != null
    );
  }

  private assertStaffInsideRestaurant(
    user: {
      restaurantRole: string | null;
      organization: {
        restaurantLatitude: unknown;
        restaurantLongitude: unknown;
        restaurantOrderRadiusMeters: number;
      };
    },
    location?: StaffAccessLocationDto,
  ) {
    if (!this.restaurantLocationRequired(user)) return;
    if (location?.latitude === undefined || location.longitude === undefined) {
      throw new ForbiddenException(
        "Debe confirmar su ubicación para acceder al puesto de trabajo",
      );
    }
    const distance = this.distanceMeters(
      Number(user.organization.restaurantLatitude),
      Number(user.organization.restaurantLongitude),
      location.latitude,
      location.longitude,
    );
    const tolerance = Math.min(Math.round(location.locationAccuracy ?? 0), 50);
    if (distance > user.organization.restaurantOrderRadiusMeters + tolerance) {
      throw new ForbiddenException(
        "Estás fuera del alcance del local comercial",
      );
    }
  }

  private async createSession(user: {
    id: string;
    organizationId: string;
    email: string;
    name: string;
    role: UserRole;
    restaurantRole: string | null;
    restaurantAvailability: RestaurantStaffAvailability;
    sessionVersion: number;
  }) {
    const payload = {
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
      restaurantRole: user.restaurantRole,
      sessionVersion: user.sessionVersion,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = this.generateRefreshToken();
    const now = new Date();
    const tracksRestaurantWork =
      Boolean(user.restaurantRole) ||
      user.role === UserRole.OWNER ||
      user.role === UserRole.ADMIN;
    await this.prisma.$transaction(async (tx) => {
      let restaurantStaffSessionId: string | undefined;
      if (tracksRestaurantWork) {
        await tx.restaurantStaffSession.updateMany({
          where: { userId: user.id, endedAt: null },
          data: { endedAt: now },
        });
        const session = await tx.restaurantStaffSession.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            initialAvailability: user.restaurantAvailability,
            startedAt: now,
            lastSeenAt: now,
          },
        });
        restaurantStaffSessionId = session.id;
      }
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          restaurantStaffSessionId,
          tokenHash: this.hashToken(refreshToken),
          expiresAt: this.getRefreshTokenExpiry(),
        },
      });
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        organizationId: user.organizationId,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurantRole: user.restaurantRole,
      },
    };
  }

  private async validStaffAccess(accessCode: string) {
    const access = await this.prisma.staffAccessCode.findUnique({
      where: { code: accessCode },
      select: {
        id: true,
        active: true,
        user: {
          select: {
            id: true,
            organizationId: true,
            email: true,
            name: true,
            passwordHash: true,
            role: true,
            restaurantRole: true,
            restaurantAvailability: true,
            active: true,
            sessionVersion: true,
            organization: {
              select: {
                name: true,
                restaurantDisplayName: true,
                restaurantAccessEnabled: true,
                restaurantLatitude: true,
                restaurantLongitude: true,
                restaurantOrderRadiusMeters: true,
              },
            },
          },
        },
      },
    });
    if (
      !access?.active ||
      !access.user.active ||
      !access.user.organization.restaurantAccessEnabled ||
      (!access.user.restaurantRole &&
        access.user.role !== UserRole.OWNER &&
        access.user.role !== UserRole.ADMIN)
    ) {
      return null;
    }
    return access;
  }

  async staffAccessProfile(
    accessCode: string,
    location?: StaffAccessLocationDto,
  ) {
    const access = await this.validStaffAccess(accessCode);
    if (!access)
      throw new NotFoundException("Staff access code is invalid or inactive");
    if (
      this.restaurantLocationRequired(access.user) &&
      (location?.latitude === undefined || location.longitude === undefined)
    ) {
      return { locationVerificationRequired: true, locationVerified: false };
    }
    this.assertStaffInsideRestaurant(access.user, location);
    return {
      restaurantName:
        access.user.organization.restaurantDisplayName ??
        access.user.organization.name,
      staffName: access.user.name,
      staffRole:
        access.user.restaurantRole ??
        (access.user.role === UserRole.OWNER ||
        access.user.role === UserRole.ADMIN
          ? "RESTAURANT_ADMIN"
          : null),
      locationVerificationRequired: this.restaurantLocationRequired(
        access.user,
      ),
      locationVerified: true,
    };
  }

  async loginWithStaffAccess(
    accessCode: string,
    password: string,
    location?: StaffAccessLocationDto,
  ) {
    const access = await this.validStaffAccess(accessCode);
    if (
      !access ||
      !(await bcrypt.compare(password, access.user.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }
    this.assertStaffInsideRestaurant(access.user, location);
    await this.prisma.staffAccessCode.update({
      where: { id: access.id },
      data: { lastUsedAt: new Date() },
    });
    return this.createSession(access.user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email.trim().toLowerCase(),
        active: true,
        organization: {
          slug: dto.organizationSlug,
        },
      },
      include: {
        organization: {
          select: {
            restaurantLatitude: true,
            restaurantLongitude: true,
            restaurantOrderRadiusMeters: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    this.assertStaffInsideRestaurant(user, dto);

    return this.createSession(user);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, restaurantStaffSessionId: true },
    });
    if (!storedToken) return;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: storedToken.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (revoked.count === 1 && storedToken.restaurantStaffSessionId) {
        await tx.restaurantStaffSession.updateMany({
          where: { id: storedToken.restaurantStaffSessionId, endedAt: null },
          data: { endedAt: now, lastSeenAt: now },
        });
      }
    });
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: true,
      },
    });

    if (
      !storedToken ||
      !storedToken.user.active ||
      storedToken.revokedAt ||
      storedToken.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const payload = {
      sub: storedToken.user.id,
      organizationId: storedToken.user.organizationId,
      role: storedToken.user.role,
      restaurantRole: storedToken.user.restaurantRole,
      sessionVersion: storedToken.user.sessionVersion,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const newRefreshToken = this.generateRefreshToken();
    const newRefreshTokenHash = this.hashToken(newRefreshToken);
    const newRefreshTokenExpiresAt = this.getRefreshTokenExpiry();

    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      if (revoked.count !== 1) {
        throw new UnauthorizedException("Invalid refresh token");
      }

      await tx.refreshToken.create({
        data: {
          userId: storedToken.user.id,
          restaurantStaffSessionId: storedToken.restaurantStaffSessionId,
          tokenHash: newRefreshTokenHash,
          expiresAt: newRefreshTokenExpiresAt,
        },
      });
      if (storedToken.restaurantStaffSessionId) {
        await tx.restaurantStaffSession.updateMany({
          where: { id: storedToken.restaurantStaffSessionId, endedAt: null },
          data: { lastSeenAt: new Date() },
        });
      }
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }
}
