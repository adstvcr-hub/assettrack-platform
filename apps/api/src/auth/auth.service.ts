import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { UserRole } from "../generated/prisma/enums";

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

  private async createSession(user: {
    id: string;
    organizationId: string;
    email: string;
    name: string;
    role: UserRole;
    restaurantRole: string | null;
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
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: this.getRefreshTokenExpiry(),
      },
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
            active: true,
            sessionVersion: true,
            organization: {
              select: {
                name: true,
                restaurantDisplayName: true,
                restaurantAccessEnabled: true,
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

  async staffAccessProfile(accessCode: string) {
    const access = await this.validStaffAccess(accessCode);
    if (!access)
      throw new NotFoundException("Staff access code is invalid or inactive");
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
    };
  }

  async loginWithStaffAccess(accessCode: string, password: string) {
    const access = await this.validStaffAccess(accessCode);
    if (
      !access ||
      !(await bcrypt.compare(password, access.user.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }
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
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.createSession(user);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
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
          tokenHash: newRefreshTokenHash,
          expiresAt: newRefreshTokenExpiresAt,
        },
      });
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }
}
