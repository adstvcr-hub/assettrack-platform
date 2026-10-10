CREATE TYPE "RestaurantProductOrigin" AS ENUM ('HOUSE_MADE', 'THIRD_PARTY');
CREATE TYPE "RestaurantFulfillment" AS ENUM ('DINE_IN', 'TAKEOUT');
CREATE TYPE "RestaurantTableKind" AS ENUM ('DINING', 'TAKEOUT_STATION');
CREATE TYPE "RestaurantInvoiceRequestStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'PROCESSED', 'REJECTED');

DROP INDEX IF EXISTS "restaurant_visits_one_open_per_table_idx";

ALTER TABLE "restaurant_tables"
ADD COLUMN "kind" "RestaurantTableKind" NOT NULL DEFAULT 'DINING';

ALTER TABLE "restaurant_visits"
ADD COLUMN "invoiceRequestStatus" "RestaurantInvoiceRequestStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN "invoiceRequestedAt" TIMESTAMP(3),
ADD COLUMN "invoiceName" TEXT,
ADD COLUMN "invoiceEmail" TEXT,
ADD COLUMN "invoicePhone" TEXT,
ADD COLUMN "invoiceTaxId" TEXT,
ADD COLUMN "invoiceReference" TEXT;

ALTER TABLE "restaurant_menu_items"
ADD COLUMN "productType" TEXT NOT NULL DEFAULT 'Otros',
ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "origin" "RestaurantProductOrigin" NOT NULL DEFAULT 'HOUSE_MADE',
ADD COLUMN "prepMinutes" INTEGER,
ADD COLUMN "alcoholic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "imageData" TEXT;

ALTER TABLE "restaurant_orders"
ADD COLUMN "fulfillment" "RestaurantFulfillment" NOT NULL DEFAULT 'DINE_IN',
ADD COLUMN "promotionId" TEXT,
ADD COLUMN "promotionTitle" TEXT,
ADD COLUMN "promotionCredit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "expectedMinutes" INTEGER,
ADD COLUMN "thresholdMinutes" INTEGER,
ADD COLUMN "delayedAt" TIMESTAMP(3);

ALTER TABLE "restaurant_order_items"
ADD COLUMN "fulfillment" "RestaurantFulfillment" NOT NULL DEFAULT 'DINE_IN',
ADD COLUMN "prepMinutes" INTEGER;

CREATE TABLE "restaurant_promotions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "productType" TEXT,
  "menuItemId" TEXT,
  "creditAmount" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "restaurant_promotions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "restaurant_promotions_organizationId_active_startsAt_endsAt_idx"
ON "restaurant_promotions"("organizationId", "active", "startsAt", "endsAt");

ALTER TABLE "restaurant_promotions"
ADD CONSTRAINT "restaurant_promotions_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
