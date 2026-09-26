CREATE TYPE "RestaurantStaffAvailability" AS ENUM (
  'AVAILABLE',
  'BREAK',
  'TEMPORARILY_UNAVAILABLE',
  'OFF_SHIFT'
);

ALTER TABLE "users"
ADD COLUMN "restaurantAvailability" "RestaurantStaffAvailability" NOT NULL DEFAULT 'AVAILABLE';

ALTER TABLE "restaurant_item_events"
ADD COLUMN "note" TEXT;

CREATE TABLE "restaurant_staff_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "availability" "RestaurantStaffAvailability" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_staff_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "restaurant_staff_events_organizationId_createdAt_idx"
ON "restaurant_staff_events"("organizationId", "createdAt");

CREATE INDEX "restaurant_staff_events_userId_createdAt_idx"
ON "restaurant_staff_events"("userId", "createdAt");
