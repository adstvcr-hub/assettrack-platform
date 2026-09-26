ALTER TYPE "RestaurantTableKind" ADD VALUE IF NOT EXISTS 'BAR_SEAT';

CREATE TYPE "RestaurantRewardType" AS ENUM ('MENU_ITEM', 'DISCOUNT_PERCENT', 'CUSTOM');

ALTER TABLE "restaurant_reward_programs"
  ADD COLUMN "rewardType" "RestaurantRewardType" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "menuItemId" TEXT,
  ADD COLUMN "discountBps" INTEGER,
  ADD COLUMN "maxDiscountAmount" INTEGER;

ALTER TABLE "restaurant_reward_programs"
  ADD CONSTRAINT "restaurant_reward_programs_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "restaurant_menu_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "restaurant_visit_transfers" (
  "id" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "fromTableId" TEXT NOT NULL,
  "toTableId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_visit_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "restaurant_visit_transfers_visitId_createdAt_idx"
  ON "restaurant_visit_transfers"("visitId", "createdAt");

ALTER TABLE "restaurant_visit_transfers" ADD CONSTRAINT "restaurant_visit_transfers_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "restaurant_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_visit_transfers" ADD CONSTRAINT "restaurant_visit_transfers_fromTableId_fkey" FOREIGN KEY ("fromTableId") REFERENCES "restaurant_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_visit_transfers" ADD CONSTRAINT "restaurant_visit_transfers_toTableId_fkey" FOREIGN KEY ("toTableId") REFERENCES "restaurant_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
