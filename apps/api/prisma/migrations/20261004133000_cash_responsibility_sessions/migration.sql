ALTER TYPE "RestaurantStaffRole" ADD VALUE IF NOT EXISTS 'CASHIER';

CREATE TYPE "RestaurantCashSessionStatus" AS ENUM ('OPEN', 'CLOSED_HANDOFF', 'CLOSED_DAY');

ALTER TABLE "users"
  ADD COLUMN "restaurantCashAuthorized" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "restaurant_cash_registers" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "restaurant_cash_registers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurant_cash_sessions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "cashRegisterId" TEXT NOT NULL,
  "responsibleUserId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "status" "RestaurantCashSessionStatus" NOT NULL DEFAULT 'OPEN',
  "openGuard" TEXT,
  "accountCount" INTEGER,
  "salesTotal" INTEGER,
  "closeNote" TEXT,
  CONSTRAINT "restaurant_cash_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurant_cash_day_closes" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "cashRegisterId" TEXT NOT NULL,
  "businessDate" TEXT NOT NULL,
  "responsibleUserId" TEXT NOT NULL,
  "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accountCount" INTEGER NOT NULL DEFAULT 0,
  "salesTotal" INTEGER NOT NULL DEFAULT 0,
  "sessionCount" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  CONSTRAINT "restaurant_cash_day_closes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_cash_registers_organizationId_name_key"
  ON "restaurant_cash_registers"("organizationId", "name");
CREATE INDEX "restaurant_cash_registers_organizationId_active_idx"
  ON "restaurant_cash_registers"("organizationId", "active");

CREATE UNIQUE INDEX "restaurant_cash_sessions_openGuard_key"
  ON "restaurant_cash_sessions"("openGuard");
CREATE INDEX "restaurant_cash_sessions_organizationId_startedAt_idx"
  ON "restaurant_cash_sessions"("organizationId", "startedAt");
CREATE INDEX "restaurant_cash_sessions_cashRegisterId_startedAt_idx"
  ON "restaurant_cash_sessions"("cashRegisterId", "startedAt");
CREATE INDEX "restaurant_cash_sessions_responsibleUserId_startedAt_idx"
  ON "restaurant_cash_sessions"("responsibleUserId", "startedAt");

CREATE UNIQUE INDEX "restaurant_cash_day_closes_cashRegisterId_businessDate_key"
  ON "restaurant_cash_day_closes"("cashRegisterId", "businessDate");
CREATE INDEX "restaurant_cash_day_closes_organizationId_businessDate_idx"
  ON "restaurant_cash_day_closes"("organizationId", "businessDate");
CREATE INDEX "restaurant_cash_day_closes_responsibleUserId_businessDate_idx"
  ON "restaurant_cash_day_closes"("responsibleUserId", "businessDate");

ALTER TABLE "restaurant_cash_registers"
  ADD CONSTRAINT "restaurant_cash_registers_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "restaurant_cash_sessions"
  ADD CONSTRAINT "restaurant_cash_sessions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_cash_sessions"
  ADD CONSTRAINT "restaurant_cash_sessions_cashRegisterId_fkey"
  FOREIGN KEY ("cashRegisterId") REFERENCES "restaurant_cash_registers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_cash_sessions"
  ADD CONSTRAINT "restaurant_cash_sessions_responsibleUserId_fkey"
  FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "restaurant_cash_day_closes"
  ADD CONSTRAINT "restaurant_cash_day_closes_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_cash_day_closes"
  ADD CONSTRAINT "restaurant_cash_day_closes_cashRegisterId_fkey"
  FOREIGN KEY ("cashRegisterId") REFERENCES "restaurant_cash_registers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_cash_day_closes"
  ADD CONSTRAINT "restaurant_cash_day_closes_responsibleUserId_fkey"
  FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;