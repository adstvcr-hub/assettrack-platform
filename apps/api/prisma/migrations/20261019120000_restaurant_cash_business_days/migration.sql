BEGIN;
-- DropIndex
DROP INDEX "restaurant_cash_day_closes_cashRegisterId_businessDate_key";

-- AlterTable
ALTER TABLE "restaurant_visits" ADD COLUMN     "cashDayId" TEXT,
ADD COLUMN     "cashSessionId" TEXT;

-- AlterTable
ALTER TABLE "restaurant_cash_sessions" ADD COLUMN     "cashDayId" TEXT;

-- AlterTable
ALTER TABLE "restaurant_cash_day_closes" ADD COLUMN     "cashDayId" TEXT;

-- CreateTable
CREATE TABLE "restaurant_cash_days" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingCash" INTEGER NOT NULL DEFAULT 0,
    "openGuard" TEXT,
    "lastConfirmedDate" TEXT NOT NULL,
    "continuedAt" TIMESTAMP(3),
    "continuedById" TEXT,

    CONSTRAINT "restaurant_cash_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_cash_days_openGuard_key" ON "restaurant_cash_days"("openGuard");

-- CreateIndex
CREATE INDEX "restaurant_cash_days_organizationId_businessDate_idx" ON "restaurant_cash_days"("organizationId", "businessDate");

-- CreateIndex
CREATE INDEX "restaurant_cash_days_cashRegisterId_businessDate_idx" ON "restaurant_cash_days"("cashRegisterId", "businessDate");

-- CreateIndex
CREATE INDEX "restaurant_visits_cashDayId_idx" ON "restaurant_visits"("cashDayId");

-- CreateIndex
CREATE INDEX "restaurant_visits_cashSessionId_idx" ON "restaurant_visits"("cashSessionId");

-- CreateIndex
CREATE INDEX "restaurant_cash_sessions_cashDayId_idx" ON "restaurant_cash_sessions"("cashDayId");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_cash_day_closes_cashDayId_key" ON "restaurant_cash_day_closes"("cashDayId");

-- CreateIndex
CREATE INDEX "restaurant_cash_day_closes_cashRegisterId_businessDate_idx" ON "restaurant_cash_day_closes"("cashRegisterId", "businessDate");

-- AddForeignKey
ALTER TABLE "restaurant_visits" ADD CONSTRAINT "restaurant_visits_cashDayId_fkey" FOREIGN KEY ("cashDayId") REFERENCES "restaurant_cash_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_visits" ADD CONSTRAINT "restaurant_visits_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "restaurant_cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_cash_days" ADD CONSTRAINT "restaurant_cash_days_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_cash_days" ADD CONSTRAINT "restaurant_cash_days_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "restaurant_cash_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_cash_days" ADD CONSTRAINT "restaurant_cash_days_continuedById_fkey" FOREIGN KEY ("continuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_cash_sessions" ADD CONSTRAINT "restaurant_cash_sessions_cashDayId_fkey" FOREIGN KEY ("cashDayId") REFERENCES "restaurant_cash_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_cash_day_closes" ADD CONSTRAINT "restaurant_cash_day_closes_cashDayId_fkey" FOREIGN KEY ("cashDayId") REFERENCES "restaurant_cash_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Restore only unfinished jornadas. Sealed historical closes remain untouched.
-- The latest final close is the boundary; handoffs after it share one jornada.
WITH pending AS (
  SELECT s.*, COALESCE(tz.name, 'UTC') AS timezone,
    row_number() OVER (PARTITION BY s."cashRegisterId" ORDER BY s."startedAt", s.id) AS n
  FROM restaurant_cash_sessions s
  LEFT JOIN LATERAL (
    SELECT l.timezone FROM organization_locations l
    WHERE l."organizationId" = s."organizationId" AND l.active
    ORDER BY l."createdAt" LIMIT 1
  ) loc ON true
  LEFT JOIN pg_timezone_names tz ON tz.name = loc.timezone
  WHERE s.status IN ('OPEN', 'CLOSED_HANDOFF')
    AND s."startedAt" >= GREATEST(
      COALESCE((SELECT max(x."endedAt") FROM restaurant_cash_sessions x
        WHERE x."cashRegisterId" = s."cashRegisterId" AND x.status = 'CLOSED_DAY'), '-infinity'),
      COALESCE((SELECT max(c."closedAt") FROM restaurant_cash_day_closes c
        WHERE c."cashRegisterId" = s."cashRegisterId"), '-infinity')
    )
)
INSERT INTO restaurant_cash_days
  (id, "organizationId", "cashRegisterId", "businessDate", timezone,
   "openedAt", "openingCash", "openGuard", "lastConfirmedDate")
SELECT md5("cashRegisterId" || id)::uuid::text, "organizationId", "cashRegisterId",
  to_char(("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE timezone, 'YYYY-MM-DD'),
  timezone, "startedAt", "openingCash", "cashRegisterId",
  to_char(("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE timezone, 'YYYY-MM-DD')
FROM pending WHERE n = 1;

UPDATE restaurant_cash_sessions s SET "cashDayId" = d.id
FROM restaurant_cash_days d
WHERE s."cashRegisterId" = d."cashRegisterId"
  AND s."startedAt" >= d."openedAt" AND s.status IN ('OPEN', 'CLOSED_HANDOFF');

UPDATE restaurant_visits v SET "cashDayId" = d.id
FROM restaurant_cash_days d
JOIN restaurant_cash_registers r ON r.id = d."cashRegisterId"
WHERE v."organizationId" = d."organizationId" AND r.name = 'Caja principal'
  AND v.status = 'CLOSED' AND v."closedAt" >= d."openedAt";

UPDATE restaurant_visits v SET "cashSessionId" = (
  SELECT s.id FROM restaurant_cash_sessions s
  WHERE s."cashDayId" = v."cashDayId" AND v."closedAt" >= s."startedAt"
    AND (s."endedAt" IS NULL OR v."closedAt" < s."endedAt")
  ORDER BY s."startedAt" DESC, s.id LIMIT 1
) WHERE v."cashDayId" IS NOT NULL;
COMMIT;
