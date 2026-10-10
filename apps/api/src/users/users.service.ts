import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as QRCode from "qrcode";
import { randomBytes } from "crypto";
import { Prisma } from "../generated/prisma/client";
import {
  RestaurantStaffAvailability,
  RestaurantStaffRole,
  RestaurantTableKind,
  RestaurantVisitStatus,
  UserRole,
} from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

const userSelection = {
  id: true,
  organizationId: true,
  email: true,
  name: true,
  role: true,
  restaurantRole: true,
  restaurantAvailability: true,
  active: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
  staffAccessCode: {
    select: { active: true, updatedAt: true, lastUsedAt: true },
  },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private async staffAccessQrPayload(
    userId: string,
    staffName: string,
    code: string,
  ) {
    const webUrl = (
      process.env.PUBLIC_WEB_URL ?? "http://localhost:3001"
    ).replace(/\/$/, "");
    const accessUrl = `${webUrl}/restaurant/staff-login/${encodeURIComponent(code)}`;
    return {
      userId,
      staffName,
      accessUrl,
      image: await QRCode.toDataURL(accessUrl, { width: 500, margin: 2 }),
      warning:
        "This image is shown after creation or renewal. Keep it under administrative control.",
    };
  }

  private async requireUser(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ) {
    const user = await tx.user.findFirst({
      where: { id, organizationId },
      select: userSelection,
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  private async assertUniqueEmail(
    tx: Prisma.TransactionClient,
    organizationId: string,
    email: string,
    exceptUserId?: string,
  ) {
    const existing = await tx.user.findFirst({
      where: {
        organizationId,
        email,
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        "Another user in this organization already uses that email",
      );
    }
  }

  private async protectLastAdministrator(
    tx: Prisma.TransactionClient,
    organizationId: string,
    target: { role: UserRole; active: boolean },
  ) {
    if (
      !target.active ||
      (target.role !== UserRole.OWNER && target.role !== UserRole.ADMIN)
    ) {
      return;
    }
    const activeAdministrators = await tx.user.count({
      where: {
        organizationId,
        active: true,
        role: { in: [UserRole.OWNER, UserRole.ADMIN] },
      },
    });
    if (activeAdministrators <= 1) {
      throw new BadRequestException(
        "The last active organization administrator cannot be deactivated or deleted",
      );
    }
  }

  private async reassignRestaurantWork(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ) {
    const candidates = await tx.user.findMany({
      where: {
        organizationId,
        id: { not: userId },
        active: true,
        restaurantAvailability: RestaurantStaffAvailability.AVAILABLE,
        restaurantRole: {
          in: [RestaurantStaffRole.WAITER, RestaurantStaffRole.BAR],
        },
      },
      select: { id: true, restaurantRole: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const openVisits = await tx.restaurantVisit.findMany({
      where: {
        organizationId,
        status: RestaurantVisitStatus.OPEN,
        OR: [{ responsibleStaffId: userId }, { fallbackStaffId: userId }],
      },
      select: { id: true, table: { select: { kind: true } } },
      orderBy: { openedAt: "asc" },
    });
    const loads = new Map(candidates.map((candidate) => [candidate.id, 0]));
    if (candidates.length) {
      const existingAssignments = await tx.restaurantVisit.groupBy({
        by: ["responsibleStaffId"],
        where: {
          organizationId,
          status: RestaurantVisitStatus.OPEN,
          responsibleStaffId: {
            in: candidates.map((candidate) => candidate.id),
          },
        },
        _count: { _all: true },
      });
      for (const assignment of existingAssignments) {
        if (assignment.responsibleStaffId) {
          loads.set(assignment.responsibleStaffId, assignment._count._all);
        }
      }
    }
    for (const visit of openVisits) {
      const preferredRole =
        visit.table.kind === RestaurantTableKind.BAR_SEAT
          ? RestaurantStaffRole.BAR
          : RestaurantStaffRole.WAITER;
      const preferred = candidates.filter(
        (candidate) => candidate.restaurantRole === preferredRole,
      );
      const pool = preferred.length ? preferred : candidates;
      const replacement = [...pool].sort(
        (left, right) =>
          (loads.get(left.id) ?? 0) - (loads.get(right.id) ?? 0) ||
          left.id.localeCompare(right.id),
      )[0];
      await tx.restaurantVisit.update({
        where: { id: visit.id },
        data: {
          responsibleStaffId: replacement?.id ?? null,
          fallbackStaffId: null,
        },
      });
      if (replacement)
        loads.set(replacement.id, (loads.get(replacement.id) ?? 0) + 1);
    }

    const waiters = candidates.filter(
      (candidate) => candidate.restaurantRole === RestaurantStaffRole.WAITER,
    );
    const tables = await tx.restaurantTable.findMany({
      where: { organizationId, active: true, kind: RestaurantTableKind.DINING },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (let index = 0; index < tables.length; index += 1) {
      await tx.restaurantTable.update({
        where: { id: tables[index].id },
        data: {
          waiterId: waiters.length ? waiters[index % waiters.length].id : null,
        },
      });
    }
  }

  async create(organizationId: string, actorId: string, dto: CreateUserDto) {
    const email = this.normalizeEmail(dto.email);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const createAccessQr = dto.createStaffAccessQr === true;
    if (
      createAccessQr &&
      !dto.restaurantRole &&
      dto.role !== UserRole.OWNER &&
      dto.role !== UserRole.ADMIN
    ) {
      throw new BadRequestException(
        "Assign restaurant access before creating this QR",
      );
    }
    const accessCode = createAccessQr
      ? randomBytes(32).toString("base64url")
      : null;
    const user = await this.prisma.$transaction(async (tx) => {
      await this.assertUniqueEmail(tx, organizationId, email);
      const user = await tx.user.create({
        data: {
          organizationId,
          email,
          name: dto.name.trim(),
          passwordHash,
          role: dto.role,
          restaurantRole: dto.restaurantRole,
          ...(accessCode
            ? { staffAccessCode: { create: { code: accessCode } } }
            : {}),
        },
        select: userSelection,
      });
      await tx.userManagementEvent.create({
        data: {
          organizationId,
          actorId,
          targetUserId: user.id,
          action: "USER_CREATED",
          metadata: { email: user.email, role: user.role },
        },
      });
      if (accessCode) {
        await tx.userManagementEvent.create({
          data: {
            organizationId,
            actorId,
            targetUserId: user.id,
            action: "STAFF_ACCESS_QR_GENERATED",
          },
        });
      }
      return user;
    });
    return {
      ...user,
      generatedStaffAccessQr: accessCode
        ? await this.staffAccessQrPayload(user.id, user.name, accessCode)
        : null,
    };
  }

  async findAll(organizationId: string, page = 1, limit = 25) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: { organizationId },
        orderBy: [{ active: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: userSelection,
      }),
      this.prisma.user.count({ where: { organizationId } }),
    ]);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async findOne(organizationId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      select: userSelection,
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async update(
    organizationId: string,
    actorId: string,
    id: string,
    dto: UpdateUserDto,
  ) {
    const email = this.normalizeEmail(dto.email);
    return this.prisma.$transaction(async (tx) => {
      const target = await this.requireUser(tx, organizationId, id);
      await this.assertUniqueEmail(tx, organizationId, email, id);
      const emailChanged = target.email !== email;
      const user = await tx.user.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          email,
          ...(emailChanged ? { sessionVersion: { increment: 1 } } : {}),
        },
        select: userSelection,
      });
      if (emailChanged) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.userManagementEvent.create({
        data: {
          organizationId,
          actorId,
          targetUserId: id,
          action: "USER_PROFILE_UPDATED",
          metadata: { previousEmail: target.email, email, name: user.name },
        },
      });
      return user;
    });
  }

  async resetPassword(
    organizationId: string,
    actorId: string,
    id: string,
    password: string,
  ) {
    const passwordHash = await bcrypt.hash(password, 12);
    return this.prisma.$transaction(async (tx) => {
      await this.requireUser(tx, organizationId, id);
      await tx.user.update({
        where: { id },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.userManagementEvent.create({
        data: {
          organizationId,
          actorId,
          targetUserId: id,
          action: "USER_PASSWORD_RESET",
        },
      });
      return { id, passwordReset: true, sessionsClosed: true };
    });
  }

  async generateStaffAccessQr(
    organizationId: string,
    actorId: string,
    id: string,
  ) {
    const code = randomBytes(32).toString("base64url");
    const target = await this.prisma.$transaction(async (tx) => {
      const user = await this.requireUser(tx, organizationId, id);
      if (!user.active) {
        throw new BadRequestException(
          "Inactive users cannot receive an access QR",
        );
      }
      if (
        !user.restaurantRole &&
        user.role !== UserRole.OWNER &&
        user.role !== UserRole.ADMIN
      ) {
        throw new BadRequestException(
          "Assign restaurant access before creating this QR",
        );
      }
      await tx.staffAccessCode.upsert({
        where: { userId: id },
        create: { userId: id, code },
        update: { code, active: true, revokedAt: null },
      });
      await tx.userManagementEvent.create({
        data: {
          organizationId,
          actorId,
          targetUserId: id,
          action: "STAFF_ACCESS_QR_GENERATED",
        },
      });
      return user;
    });
    return this.staffAccessQrPayload(id, target.name, code);
  }

  async revokeStaffAccessQr(
    organizationId: string,
    actorId: string,
    id: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireUser(tx, organizationId, id);
      const result = await tx.staffAccessCode.updateMany({
        where: { userId: id, active: true },
        data: { active: false, revokedAt: new Date() },
      });
      await tx.userManagementEvent.create({
        data: {
          organizationId,
          actorId,
          targetUserId: id,
          action: "STAFF_ACCESS_QR_REVOKED",
        },
      });
      return { id, revoked: result.count > 0 };
    });
  }

  async setActive(
    organizationId: string,
    actorId: string,
    id: string,
    active: boolean,
  ) {
    if (id === actorId && !active) {
      throw new ForbiddenException("You cannot deactivate your own account");
    }
    return this.prisma.$transaction(async (tx) => {
      const target = await this.requireUser(tx, organizationId, id);
      if (!active) {
        await this.protectLastAdministrator(tx, organizationId, target);
        await this.reassignRestaurantWork(tx, organizationId, id);
      }
      const user = await tx.user.update({
        where: { id },
        data: {
          active,
          deactivatedAt: active ? null : new Date(),
          restaurantAvailability: active
            ? RestaurantStaffAvailability.AVAILABLE
            : RestaurantStaffAvailability.OFF_SHIFT,
          sessionVersion: { increment: 1 },
        },
        select: userSelection,
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!active) {
        await tx.staffAccessCode.updateMany({
          where: { userId: id, active: true },
          data: { active: false, revokedAt: new Date() },
        });
      }
      await tx.userManagementEvent.create({
        data: {
          organizationId,
          actorId,
          targetUserId: id,
          action: active ? "USER_REACTIVATED" : "USER_DEACTIVATED",
        },
      });
      return user;
    });
  }

  async remove(organizationId: string, actorId: string, id: string) {
    if (id === actorId)
      throw new ForbiddenException("You cannot delete your own account");
    return this.prisma.$transaction(async (tx) => {
      const target = await this.requireUser(tx, organizationId, id);
      await this.protectLastAdministrator(tx, organizationId, target);
      const [
        scans,
        tables,
        visits,
        itemEvents,
        staffEvents,
        transfers,
        adminEvents,
        cashSessions,
        cashDayCloses,
      ] = await Promise.all([
        tx.scanEvent.count({ where: { userId: id } }),
        tx.restaurantTable.count({ where: { waiterId: id } }),
        tx.restaurantVisit.count({
          where: { OR: [{ responsibleStaffId: id }, { fallbackStaffId: id }] },
        }),
        tx.restaurantItemEvent.count({ where: { actorId: id } }),
        tx.restaurantStaffEvent.count({
          where: { OR: [{ userId: id }, { actorId: id }] },
        }),
        tx.restaurantVisitTransfer.count({ where: { actorId: id } }),
        tx.platformAdminEvent.count({
          where: { OR: [{ actorId: id }, { targetUserId: id }] },
        }),
        tx.restaurantCashSession.count({
          where: { responsibleUserId: id },
        }),
        tx.restaurantCashDayClose.count({
          where: { responsibleUserId: id },
        }),
      ]);
      const historicalReferences =
        scans +
        tables +
        visits +
        itemEvents +
        staffEvents +
        transfers +
        adminEvents +
        cashSessions +
        cashDayCloses;

      if (historicalReferences > 0) {
        await this.reassignRestaurantWork(tx, organizationId, id);
        await tx.user.update({
          where: { id },
          data: {
            active: false,
            deactivatedAt: new Date(),
            restaurantAvailability: RestaurantStaffAvailability.OFF_SHIFT,
            sessionVersion: { increment: 1 },
          },
        });
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.staffAccessCode.updateMany({
          where: { userId: id, active: true },
          data: { active: false, revokedAt: new Date() },
        });
        await tx.userManagementEvent.create({
          data: {
            organizationId,
            actorId,
            targetUserId: id,
            action: "USER_ARCHIVED",
            metadata: { historicalReferences, email: target.email },
          },
        });
        return {
          id,
          mode: "ARCHIVED",
          message: "User was deactivated to preserve operational history",
        };
      }

      await tx.userManagementEvent.create({
        data: {
          organizationId,
          actorId,
          targetUserId: id,
          action: "USER_DELETED",
          metadata: { email: target.email },
        },
      });
      await tx.user.delete({ where: { id } });
      return { id, mode: "DELETED", message: "User permanently deleted" };
    });
  }
}
