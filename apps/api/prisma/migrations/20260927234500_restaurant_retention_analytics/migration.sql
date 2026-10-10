ALTER TABLE "organizations"
  ADD COLUMN "restaurantRetentionDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_restaurantRetentionDays_check"
  CHECK ("restaurantRetentionDays" BETWEEN 1 AND 30);

ALTER TABLE "restaurant_visits"
  ADD COLUMN "receiptNumber" TEXT,
  ADD COLUMN "openedAnalyticsConsolidatedAt" TIMESTAMP(3),
  ADD COLUMN "closedAnalyticsConsolidatedAt" TIMESTAMP(3);

ALTER TABLE "restaurant_orders"
  ADD COLUMN "analyticsConsolidatedAt" TIMESTAMP(3);

ALTER TABLE "restaurant_qr_accesses"
  ADD COLUMN "analyticsConsolidatedAt" TIMESTAMP(3);

ALTER TABLE "restaurant_orders"
  DROP CONSTRAINT "restaurant_orders_visitId_fkey",
  ADD CONSTRAINT "restaurant_orders_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "restaurant_visits"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "restaurant_analytics_daily" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "qrAccesses" INTEGER NOT NULL DEFAULT 0,
  "uniqueQrSessions" INTEGER NOT NULL DEFAULT 0,
  "visitsOpened" INTEGER NOT NULL DEFAULT 0,
  "visitsClosed" INTEGER NOT NULL DEFAULT 0,
  "orders" INTEGER NOT NULL DEFAULT 0,
  "grossSubtotal" INTEGER NOT NULL DEFAULT 0,
  "promotionCredit" INTEGER NOT NULL DEFAULT 0,
  "subtotal" INTEGER NOT NULL DEFAULT 0,
  "tax" INTEGER NOT NULL DEFAULT 0,
  "service" INTEGER NOT NULL DEFAULT 0,
  "total" INTEGER NOT NULL DEFAULT 0,
  "itemsSold" INTEGER NOT NULL DEFAULT 0,
  "itemsCancelled" INTEGER NOT NULL DEFAULT 0,
  "dineInOrders" INTEGER NOT NULL DEFAULT 0,
  "takeoutOrders" INTEGER NOT NULL DEFAULT 0,
  "deliveryOrders" INTEGER NOT NULL DEFAULT 0,
  "demandByHour" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "restaurant_analytics_daily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurant_analytics_product_daily" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "restaurant_analytics_product_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_visits_receiptNumber_key"
  ON "restaurant_visits"("receiptNumber");
CREATE INDEX "restaurant_visits_organizationId_closedAt_idx"
  ON "restaurant_visits"("organizationId", "closedAt");
CREATE INDEX "restaurant_visits_receiptNumber_idx"
  ON "restaurant_visits"("receiptNumber");
CREATE INDEX "restaurant_orders_organizationId_analyticsConsolidatedAt_createdAt_idx"
  ON "restaurant_orders"("organizationId", "analyticsConsolidatedAt", "createdAt");
CREATE INDEX "restaurant_qr_accesses_organizationId_analyticsConsolidatedAt_createdAt_idx"
  ON "restaurant_qr_accesses"("organizationId", "analyticsConsolidatedAt", "createdAt");
CREATE UNIQUE INDEX "restaurant_analytics_daily_organizationId_date_key"
  ON "restaurant_analytics_daily"("organizationId", "date");
CREATE INDEX "restaurant_analytics_daily_date_idx"
  ON "restaurant_analytics_daily"("date");
CREATE UNIQUE INDEX "restaurant_analytics_product_daily_organizationId_date_productName_key"
  ON "restaurant_analytics_product_daily"("organizationId", "date", "productName");
CREATE INDEX "restaurant_analytics_product_daily_date_idx"
  ON "restaurant_analytics_product_daily"("date");

ALTER TABLE "restaurant_analytics_daily"
  ADD CONSTRAINT "restaurant_analytics_daily_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "restaurant_analytics_product_daily"
  ADD CONSTRAINT "restaurant_analytics_product_daily_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
