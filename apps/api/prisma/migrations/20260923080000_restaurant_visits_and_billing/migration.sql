CREATE TYPE "RestaurantVisitStatus" AS ENUM ('OPEN', 'CLOSED');

ALTER TABLE "organizations"
ADD COLUMN "restaurantTaxRateBps" INTEGER NOT NULL DEFAULT 1300,
ADD COLUMN "restaurantTaxIncluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "restaurantServiceRateBps" INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE "restaurant_tables"
ADD COLUMN "serviceChargeEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "restaurant_visits" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "accessCode" TEXT NOT NULL,
  "status" "RestaurantVisitStatus" NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "taxRateBps" INTEGER NOT NULL DEFAULT 1300,
  "taxIncluded" BOOLEAN NOT NULL DEFAULT false,
  "serviceRateBps" INTEGER NOT NULL DEFAULT 1000,
  "serviceChargeEnabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "restaurant_visits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "restaurant_orders" ADD COLUMN "visitId" TEXT;

-- Preserve the current table account when upgrading an existing restaurant.
-- The most recent order access code becomes the access code for the grouped visit.
INSERT INTO "restaurant_visits" (
  "id", "organizationId", "tableId", "accessCode", "status", "openedAt", "closedAt"
)
SELECT
  'legacy-' || md5(latest."tableId"),
  latest."organizationId",
  latest."tableId",
  latest."accessCode",
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "restaurant_orders" ro
      JOIN "restaurant_order_items" ri ON ri."orderId" = ro."id"
      WHERE ro."tableId" = latest."tableId"
        AND ri."status" IN ('RECEIVED', 'ACCEPTED', 'PREPARING', 'READY')
    ) THEN 'OPEN'::"RestaurantVisitStatus"
    ELSE 'CLOSED'::"RestaurantVisitStatus"
  END,
  (
    SELECT MIN(ro."createdAt")
    FROM "restaurant_orders" ro
    WHERE ro."tableId" = latest."tableId"
  ),
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "restaurant_orders" ro
      JOIN "restaurant_order_items" ri ON ri."orderId" = ro."id"
      WHERE ro."tableId" = latest."tableId"
        AND ri."status" IN ('RECEIVED', 'ACCEPTED', 'PREPARING', 'READY')
    ) THEN NULL
    ELSE CURRENT_TIMESTAMP
  END
FROM (
  SELECT DISTINCT ON ("tableId")
    "organizationId", "tableId", "accessCode", "createdAt"
  FROM "restaurant_orders"
  ORDER BY "tableId", "createdAt" DESC
) latest;

UPDATE "restaurant_orders" ro
SET "visitId" = 'legacy-' || md5(ro."tableId");

UPDATE "restaurant_visits" rv
SET
  "taxRateBps" = org."restaurantTaxRateBps",
  "taxIncluded" = org."restaurantTaxIncluded",
  "serviceRateBps" = org."restaurantServiceRateBps",
  "serviceChargeEnabled" = rt."serviceChargeEnabled"
FROM "organizations" org, "restaurant_tables" rt
WHERE rv."organizationId" = org."id" AND rv."tableId" = rt."id";

CREATE UNIQUE INDEX "restaurant_visits_accessCode_key"
ON "restaurant_visits"("accessCode");
CREATE INDEX "restaurant_visits_organizationId_status_idx"
ON "restaurant_visits"("organizationId", "status");
CREATE INDEX "restaurant_visits_tableId_status_idx"
ON "restaurant_visits"("tableId", "status");
CREATE UNIQUE INDEX "restaurant_visits_one_open_per_table_idx"
ON "restaurant_visits"("tableId") WHERE "status" = 'OPEN';
CREATE INDEX "restaurant_orders_visitId_idx"
ON "restaurant_orders"("visitId");

ALTER TABLE "restaurant_visits"
ADD CONSTRAINT "restaurant_visits_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_visits"
ADD CONSTRAINT "restaurant_visits_tableId_fkey"
FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_orders"
ADD CONSTRAINT "restaurant_orders_visitId_fkey"
FOREIGN KEY ("visitId") REFERENCES "restaurant_visits"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
