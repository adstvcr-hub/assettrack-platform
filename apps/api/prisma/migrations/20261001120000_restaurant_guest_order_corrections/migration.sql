ALTER TABLE "organizations"
ADD COLUMN "restaurantOrderCorrectionMinutes" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "restaurant_orders"
ADD COLUMN "correctionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastCorrectionRequestId" TEXT,
ADD COLUMN "correctionRequestedAt" TIMESTAMP(3),
ADD COLUMN "correctionRequestNote" TEXT;

CREATE UNIQUE INDEX "restaurant_orders_lastCorrectionRequestId_key"
ON "restaurant_orders"("lastCorrectionRequestId");

ALTER TABLE "restaurant_order_items"
ADD COLUMN "cancelledByGuestCorrection" BOOLEAN NOT NULL DEFAULT false;
