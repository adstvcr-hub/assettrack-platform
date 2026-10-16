ALTER TYPE "RestaurantFulfillment" ADD VALUE IF NOT EXISTS 'DELIVERY';

CREATE TYPE "RestaurantPaymentStatus" AS ENUM (
  'NOT_REQUIRED',
  'PENDING',
  'CONFIRMED',
  'REJECTED'
);

ALTER TABLE "organizations"
  ADD COLUMN "restaurantLatitude" DECIMAL(10, 7),
  ADD COLUMN "restaurantLongitude" DECIMAL(10, 7),
  ADD COLUMN "restaurantOrderRadiusMeters" INTEGER NOT NULL DEFAULT 150;

ALTER TABLE "restaurant_visits"
  ADD COLUMN "occupiesTable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deliveryPhone" TEXT,
  ADD COLUMN "deliveryAddress" TEXT,
  ADD COLUMN "paymentStatus" "RestaurantPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "paymentConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "paymentConfirmedById" TEXT,
  ADD COLUMN "deliveryHandedOffAt" TIMESTAMP(3),
  ADD COLUMN "deliveryHandedOffById" TEXT;

CREATE TABLE "restaurant_qr_accesses" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "sessionKey" TEXT NOT NULL,
  "insideLocal" BOOLEAN,
  "distanceMeters" INTEGER,
  "accuracyMeters" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_qr_accesses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "restaurant_qr_accesses_organizationId_createdAt_idx"
  ON "restaurant_qr_accesses"("organizationId", "createdAt");
CREATE INDEX "restaurant_qr_accesses_tableId_createdAt_idx"
  ON "restaurant_qr_accesses"("tableId", "createdAt");
CREATE INDEX "restaurant_qr_accesses_sessionKey_createdAt_idx"
  ON "restaurant_qr_accesses"("sessionKey", "createdAt");

ALTER TABLE "restaurant_qr_accesses"
  ADD CONSTRAINT "restaurant_qr_accesses_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_qr_accesses"
  ADD CONSTRAINT "restaurant_qr_accesses_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
