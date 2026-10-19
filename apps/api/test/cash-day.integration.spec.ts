import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaService } from "../src/prisma/prisma.service";
import { RestaurantCashService } from "../src/restaurant/restaurant-cash.service";
import { RestaurantService } from "../src/restaurant/restaurant.service";
import { cashTransaction } from "../src/restaurant/cash-day-context";
import { RestaurantStaffRole, UserRole } from "../src/generated/prisma/enums";

// Explicit integration target. Creates and drops its own database; never resets
// the database in DATABASE_URL. Run with a local PostgreSQL role with CREATEDB.
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl)
  throw new Error(
    "DATABASE_URL is required for the cash-day integration tests",
  );
const dbName = `cash_day_test_${randomUUID().replaceAll("-", "")}`;
const isolatedUrl = new URL(baseUrl);
isolatedUrl.pathname = `/${dbName}`;
const admin = new Client({ connectionString: baseUrl });
let prisma: PrismaService;
let cash: RestaurantCashService;
let restaurant: RestaurantService;
let legacyClose: Record<string, unknown>;

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const db = new Client({ connectionString: isolatedUrl.toString() });
  await db.connect();
  try {
    const path = resolve("prisma/migrations");
    const migrations = (await readdir(path))
      .filter((name) => /^\d/.test(name))
      .sort();
    for (const name of migrations.filter((name) => name < "20261019120000")) {
      await db.query(
        await readFile(resolve(path, name, "migration.sql"), "utf8"),
      );
    }
    // An already sealed close and an unfinished overnight handoff chain.
    await db.query(`
      INSERT INTO organizations (id,name,slug,"updatedAt") VALUES ('legacy-org','Legacy','legacy',now());
      INSERT INTO users (id,"organizationId",email,name,"passwordHash","updatedAt") VALUES ('legacy-user','legacy-org','legacy@example.invalid','Legacy','unused',now());
      INSERT INTO organization_locations (id,"organizationId",name,"nameKey",latitude,longitude,timezone,country,"updatedAt") VALUES ('legacy-location','legacy-org','Local','local',0,0,'America/Costa_Rica','CR',now());
      INSERT INTO restaurant_tables (id,"organizationId",name,code) VALUES ('legacy-table','legacy-org','Mesa','legacy-code');
      INSERT INTO restaurant_cash_registers (id,"organizationId",name,"updatedAt") VALUES ('legacy-register','legacy-org','Caja principal',now());
      INSERT INTO restaurant_cash_day_closes (id,"organizationId","cashRegisterId","businessDate","responsibleUserId","closedAt","salesTotal") VALUES ('legacy-close','legacy-org','legacy-register','2026-10-16','legacy-user','2026-10-17 08:00:00',9800);
      INSERT INTO restaurant_cash_sessions (id,"organizationId","cashRegisterId","responsibleUserId","startedAt","endedAt",status,"openingCash","openGuard") VALUES
        ('legacy-sealed','legacy-org','legacy-register','legacy-user','2026-10-16 20:00:00','2026-10-17 08:00:00','CLOSED_DAY',1000,null),
        ('legacy-handoff','legacy-org','legacy-register','legacy-user','2026-10-18 05:00:00','2026-10-18 06:15:00','CLOSED_HANDOFF',2000,null),
        ('legacy-open','legacy-org','legacy-register','legacy-user','2026-10-18 06:15:00',null,'OPEN',2500,'legacy-register');
      INSERT INTO restaurant_visits (id,"organizationId","tableId","accessCode",status,"closedAt") VALUES
        ('legacy-paid','legacy-org','legacy-table','legacy-paid-code','CLOSED','2026-10-18 06:30:00'),
        ('legacy-old','legacy-org','legacy-table','legacy-old-code','CLOSED','2026-10-17 07:30:00');
    `);
    legacyClose = (
      await db.query(
        `SELECT * FROM restaurant_cash_day_closes WHERE id='legacy-close'`,
      )
    ).rows[0];
    await db.query(
      await readFile(
        resolve(
          path,
          "20261019120000_restaurant_cash_business_days/migration.sql",
        ),
        "utf8",
      ),
    );
  } finally {
    await db.end();
  }
  const savedUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = isolatedUrl.toString();
  prisma = new PrismaService();
  process.env.DATABASE_URL = savedUrl;
  await prisma.$connect();
  cash = new RestaurantCashService(prisma);
  restaurant = new RestaurantService(prisma);
}, 60000);

afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await prisma?.$disconnect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.end();
});

function clock(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}
async function fixture() {
  const organization = await prisma.organization.create({
    data: { name: "Cash day test", slug: randomUUID() },
  });
  const organizationId = organization.id;
  await prisma.organizationLocation.create({
    data: {
      organizationId,
      name: "Local",
      nameKey: "local",
      latitude: 0,
      longitude: 0,
      timezone: "America/Costa_Rica",
      country: "CR",
    },
  });
  const user = await prisma.user.create({
    data: {
      organizationId,
      email: `${randomUUID()}@example.invalid`,
      name: "Caja",
      passwordHash: "unused",
      role: "USER",
      restaurantRole: "RESTAURANT_ADMIN",
    },
  });
  const actor = {
    id: user.id,
    organizationId,
    role: UserRole.USER,
    restaurantRole: RestaurantStaffRole.RESTAURANT_ADMIN,
  };
  const table = await prisma.restaurantTable.create({
    data: { organizationId, name: "Mesa" },
  });
  const product = await prisma.restaurantMenuItem.create({
    data: {
      organizationId,
      name: "Producto",
      price: 1,
      station: "BAR",
      course: "DRINK",
    },
  });
  const visit = async (price: number, delivery = false) =>
    prisma.restaurantVisit.create({
      data: {
        organizationId,
        tableId: table.id,
        taxRateBps: 0,
        serviceRateBps: 0,
        serviceChargeEnabled: false,
        ...(delivery
          ? {
              occupiesTable: false,
              paymentStatus: "CONFIRMED",
              paymentMethod: "CASH",
            }
          : {}),
        orders: {
          create: {
            organizationId,
            tableId: table.id,
            requestId: randomUUID(),
            items: {
              create: {
                name: "Producto",
                menuItemId: product.id,
                course: "DRINK",
                price,
                quantity: 1,
                station: "BAR",
                status: "DELIVERED",
              },
            },
          },
        },
      },
    });
  return { actor, organizationId, visit };
}

describe("cash business days with PostgreSQL", () => {
  it("migrates only unfinished sessions and their sales without rewriting sealed history", async () => {
    const day = await prisma.restaurantCashDay.findUniqueOrThrow({
      where: { openGuard: "legacy-register" },
    });
    expect(day.businessDate).toBe("2026-10-17");
    expect(day.timezone).toBe("America/Costa_Rica");
    expect(day.openingCash).toBe(2000);
    expect(
      await prisma.restaurantCashSession.count({
        where: { cashDayId: day.id },
      }),
    ).toBe(2);
    expect(
      await prisma.restaurantVisit.findUnique({ where: { id: "legacy-paid" } }),
    ).toMatchObject({ cashDayId: day.id, cashSessionId: "legacy-open" });
    expect(
      await prisma.restaurantVisit.findUnique({ where: { id: "legacy-old" } }),
    ).toMatchObject({ cashDayId: null, cashSessionId: null });
    const stored = await prisma.restaurantCashDayClose.findUniqueOrThrow({
      where: { id: "legacy-close" },
    });
    const { cashDayId, ...oldFields } = stored;
    expect(cashDayId).toBeNull();
    expect(oldFields).toEqual(legacyClose);
  });

  it("keeps an overnight jornada across handoffs and closes it over 24 hours later, then opens today cleanly", async () => {
    clock("2026-10-17T23:00:00Z");
    const { actor, organizationId, visit } = await fixture();
    const session = await cash.assume(actor, 1000);
    const day = await prisma.restaurantCashDay.findUniqueOrThrow({
      where: { id: session.cashDayId! },
    });
    const firstSale = await visit(500);
    await restaurant.closeVisit(actor, firstSale.id, "CASH");
    await cash.addEmployeePayment(actor, {
      employeeId: actor.id,
      amount: 100,
      paymentMethod: "CASH",
    });
    await cash.close(actor, session.id, {
      finalDailyClose: false,
      countedCash: 1400,
    });
    clock("2026-10-18T07:00:00Z");
    const receiver = await prisma.user.create({
      data: {
        organizationId,
        email: `${randomUUID()}@example.invalid`,
        name: "Relevo",
        passwordHash: "unused",
        role: "USER",
        restaurantRole: "CASHIER",
      },
    });
    const nextActor = {
      ...actor,
      id: receiver.id,
      restaurantRole: RestaurantStaffRole.CASHIER,
    };
    const next = await cash.assume(nextActor, 1400);
    expect(next.cashDayId).toBe(day.id);
    const current = await cash.current(actor);
    expect(current).toMatchObject({
      businessDate: "2026-10-17",
      today: "2026-10-18",
      requiresContinuation: true,
    });
    const overnight = await visit(900);
    await expect(restaurant.closeVisit(actor, overnight.id)).rejects.toThrow(
      "Continuar jornada",
    );
    await expect(
      cash.addEmployeePayment(nextActor, {
        employeeId: actor.id,
        amount: 10,
        paymentMethod: "CASH",
      }),
    ).rejects.toThrow("Continuar jornada");
    await cash.continueDay(nextActor, day.id);
    await restaurant.closeVisit(actor, overnight.id, "CASH");
    await cash.addSupplierInvoice(nextActor, {
      supplierName: "Proveedor",
      invoiceNumber: "N-1",
      invoiceDate: "2026-10-18",
      amount: 200,
      status: "PAID",
      paymentMethod: "CASH",
    });
    clock("2026-10-19T08:00:00Z");
    // Closing a pending day remains allowed without claiming work continued.
    const closed = await cash.close(nextActor, next.id, {
      finalDailyClose: true,
      countedCash: 2100,
    });
    expect(closed).toHaveProperty("dayClose");
    if (!("dayClose" in closed)) throw new Error("Expected final close");
    expect(closed.dayClose).toMatchObject({
      cashDayId: day.id,
      businessDate: "2026-10-17",
      accountCount: 2,
      salesTotal: 1400,
      openingCash: 1000,
      expectedCash: 2100,
      discrepancy: 0,
      sessionCount: 2,
      employeePaymentsTotal: 100,
      supplierPaymentsTotal: 200,
    });
    expect(closed.dayClose.closedAt.getTime()).toBeGreaterThan(
      day.openedAt.getTime() + 86400000,
    );
    const history = await cash.history(actor, "2026-10-17", "2026-10-17");
    expect(history.closes[0].employeePaymentSummary.breakdownComplete).toBe(
      true,
    );
    const report = await cash.daily(actor, "2026-10-17", day.id);
    expect(report.daySummary.salesTotal).toBe(1400);
    expect(report.supplierInvoices).toHaveLength(1);
    const fresh = await cash.assume(actor, 300);
    expect(fresh.cashDayId).not.toBe(day.id);
    expect(await cash.current(actor)).toMatchObject({
      businessDate: "2026-10-19",
      requiresContinuation: false,
      currentSummary: { salesTotal: 0 },
      currentReconciliation: { expectedCash: 300 },
    });
    const sameDay = await cash.close(actor, fresh.id, {
      finalDailyClose: true,
      countedCash: 300,
    });
    const reopened = await cash.assume(actor, 20);
    expect(reopened.cashDayId).not.toBe(fresh.cashDayId);
    expect(
      await prisma.restaurantCashDayClose.count({ where: { organizationId } }),
    ).toBe(2);
    expect(sameDay).toHaveProperty("dayClose.businessDate", "2026-10-19");
  });

  it("freezes timezone and does not allow another responsible person to confirm continuation", async () => {
    clock("2026-10-18T05:30:00Z");
    const { actor, organizationId } = await fixture();
    const session = await cash.assume(actor, 0);
    await prisma.organizationLocation.updateMany({
      where: { organizationId },
      data: { timezone: "Asia/Tokyo" },
    });
    expect(await cash.current(actor)).toMatchObject({
      businessDate: "2026-10-17",
      today: "2026-10-17",
      timezone: "America/Costa_Rica",
      requiresContinuation: false,
    });
    clock("2026-10-18T06:01:00Z");
    await expect(
      cash.continueDay({ ...actor, id: randomUUID() }, session.cashDayId!),
    ).rejects.toThrow("responsable actual");
    await cash.continueDay(actor, session.cashDayId!);
    expect(await cash.current(actor)).toMatchObject({
      businessDate: "2026-10-17",
      today: "2026-10-18",
      requiresContinuation: false,
    });
    const day = await prisma.restaurantCashDay.findUniqueOrThrow({
      where: { id: session.cashDayId! },
    });
    expect(await prisma.platformAdminEvent.count({ where: { organizationId, action: "RESTAURANT_CASH_DAY_CONTINUED", actorId: actor.id } })).toBe(1);
    expect(day).toMatchObject({
      continuedById: actor.id,
      lastConfirmedDate: "2026-10-18",
    });
  });

  it("includes next-date employee payments in the original jornada history", async () => {
    clock("2026-10-17T23:00:00Z");
    const { actor } = await fixture();
    const session = await cash.assume(actor, 1000);
    clock("2026-10-18T07:00:00Z");
    await cash.continueDay(actor, session.cashDayId!);
    await cash.addEmployeePayment(actor, {
      employeeId: actor.id,
      amount: 300,
      paymentMethod: "CASH",
    });
    await cash.close(actor, session.id, {
      finalDailyClose: true,
      countedCash: 700,
    });
    const report = await cash.history(actor, "2026-10-17", "2026-10-17");
    expect(report.closes[0]).toMatchObject({
      businessDate: "2026-10-17",
      employeePaymentSummary: {
        employeePaymentsTotal: 300,
        breakdownComplete: true,
      },
    });
    expect(report.closes[0].employeePayments).toHaveLength(1);
    expect(
      (await cash.daily(actor, "2026-10-18")).employeePayments,
    ).toHaveLength(0);
  });

  it("serializes a concurrent sale and final close without losing a committed sale", async () => {
    clock("2026-10-18T20:00:00Z");
    const { actor, visit } = await fixture();
    const session = await cash.assume(actor, 1000);
    const sale = await visit(500);
    const [charge, close] = await Promise.allSettled([
      restaurant.closeVisit(actor, sale.id, "CASH"),
      cash.close(actor, session.id, {
        finalDailyClose: true,
        countedCash: 1500,
      }),
    ]);
    expect(close.status).toBe("fulfilled");
    const storedVisit = await prisma.restaurantVisit.findUniqueOrThrow({
      where: { id: sale.id },
    });
    const storedClose = await prisma.restaurantCashDayClose.findUniqueOrThrow({
      where: { cashDayId: session.cashDayId! },
    });
    expect(storedClose.salesTotal).toBe(
      charge.status === "fulfilled" ? 500 : 0,
    );
    expect(storedVisit.status).toBe(
      charge.status === "fulfilled" ? "CLOSED" : "OPEN",
    );
    await expect(
      cash.close(actor, session.id, { finalDailyClose: true, countedCash: 0 }),
    ).rejects.toThrow();
    expect(
      await prisma.restaurantCashDayClose.count({
        where: { cashDayId: session.cashDayId },
      }),
    ).toBe(1);
  });

  it("blocks charges without cash responsibility and associates delivery handoff once", async () => {
    clock("2026-10-18T20:00:00Z");
    const { actor, visit } = await fixture();
    const sale = await visit(200);
    await expect(restaurant.closeVisit(actor, sale.id)).rejects.toThrow(
      "Abra o asuma",
    );
    const session = await cash.assume(actor, 0);
    const delivery = await visit(400, true);
    const closed = await restaurant.handoffDelivery(actor, delivery.id);
    expect(closed).toMatchObject({
      cashDayId: session.cashDayId,
      cashSessionId: session.id,
      status: "CLOSED",
    });
    clock("2026-10-19T20:00:00Z");
    const repeated = await restaurant.handoffDelivery(actor, delivery.id);
    expect(repeated.closedAt).toEqual(closed.closedAt);
    expect(
      await prisma.restaurantVisit.count({
        where: { cashDayId: session.cashDayId, status: "CLOSED" },
      }),
    ).toBe(1);
  });

  it("allows one opener and one final close when two requests race", async () => {
    clock("2026-10-18T20:00:00Z");
    const { actor, organizationId } = await fixture();
    const other = await prisma.user.create({
      data: {
        organizationId,
        email: `${randomUUID()}@example.invalid`,
        name: "Otra caja",
        passwordHash: "unused",
        restaurantRole: "CASHIER",
      },
    });
    const starts = await Promise.allSettled([
      cash.assume(actor, 100),
      cash.assume({ ...actor, id: other.id }, 200),
    ]);
    expect(
      starts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const session = await prisma.restaurantCashSession.findFirstOrThrow({
      where: { organizationId, openGuard: { not: null } },
    });
    expect(
      await prisma.restaurantCashDay.count({ where: { organizationId } }),
    ).toBe(1);
    expect(
      await prisma.restaurantCashSession.count({ where: { organizationId } }),
    ).toBe(1);
    const responsible = { ...actor, id: session.responsibleUserId };
    const closes = await Promise.allSettled([
      cash.close(responsible, session.id, {
        finalDailyClose: true,
        countedCash: session.openingCash,
      }),
      cash.close(responsible, session.id, {
        finalDailyClose: true,
        countedCash: session.openingCash,
      }),
    ]);
    expect(
      closes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.restaurantCashDayClose.count({ where: { organizationId } }),
    ).toBe(1);
  });

  it("retries serialization conflicts but never retries unrelated failures", async () => {
    const conflict = Object.assign(new Error("serialization"), {
      code: "P2034",
    });
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce("ok");
    expect(
      await cashTransaction(
        { $transaction: transaction } as never,
        async () => "ok",
      ),
    ).toBe("ok");
    expect(transaction).toHaveBeenCalledTimes(2);
    const failure = new Error("unrelated");
    transaction.mockReset().mockRejectedValue(failure);
    await expect(
      cashTransaction({ $transaction: transaction } as never, async () => "ok"),
    ).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
