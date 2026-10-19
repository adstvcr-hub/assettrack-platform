import { ConflictException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

export function cashLocalDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Retry serialization conflicts so a charge and a final close cannot both
// commit using different snapshots of the same open day.
export async function cashTransaction<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "P2034" && attempt < 3) continue;
      if (code === "P2034" || code === "P2002") {
        throw new ConflictException(
          "La caja cambió durante la operación. Actualice e intente nuevamente.",
        );
      }
      throw error;
    }
  }
}

export function assertCashDayConfirmed(
  day: {
    timezone: string;
    businessDate: string;
    lastConfirmedDate: string;
  },
  now = new Date(),
) {
  if (day.lastConfirmedDate !== cashLocalDate(now, day.timezone)) {
    throw new ConflictException(
      `La jornada de caja del ${day.businessDate} sigue abierta. En Caja, su responsable debe elegir Continuar jornada o Cerrar jornada pendiente antes de registrar nuevos cobros o movimientos.`,
    );
  }
}

export async function activeCashContext(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const session = await tx.restaurantCashSession.findFirst({
    where: {
      organizationId,
      openGuard: { not: null },
      cashRegister: { name: "Caja principal", active: true },
    },
    include: { cashDay: true },
  });
  if (!session?.cashDay?.openGuard || session.cashDay.closedAt) {
    throw new ConflictException(
      "Abra o asuma la caja antes de registrar nuevos cobros o movimientos.",
    );
  }
  assertCashDayConfirmed(session.cashDay);
  return { cashDayId: session.cashDay.id, cashSessionId: session.id };
}
