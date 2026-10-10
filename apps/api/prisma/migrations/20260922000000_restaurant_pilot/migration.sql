CREATE TYPE "RestaurantStation" AS ENUM ('KITCHEN', 'BAR');
CREATE TYPE "RestaurantCourse" AS ENUM ('DRINK', 'STARTER', 'MAIN', 'OTHER');
CREATE TYPE "RestaurantItemStatus" AS ENUM ('RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED');

CREATE TABLE "restaurant_tables" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "restaurant_tables_code_key" ON "restaurant_tables"("code");
CREATE UNIQUE INDEX "restaurant_tables_organizationId_name_key" ON "restaurant_tables"("organizationId", "name");
CREATE INDEX "restaurant_tables_organizationId_idx" ON "restaurant_tables"("organizationId");
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "restaurant_menu_items" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" INTEGER NOT NULL,
  "station" "RestaurantStation" NOT NULL,
  "course" "RestaurantCourse" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_menu_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "restaurant_menu_items_organizationId_active_idx" ON "restaurant_menu_items"("organizationId", "active");
ALTER TABLE "restaurant_menu_items" ADD CONSTRAINT "restaurant_menu_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "restaurant_orders" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "accessCode" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "restaurant_orders_accessCode_key" ON "restaurant_orders"("accessCode");
CREATE UNIQUE INDEX "restaurant_orders_requestId_key" ON "restaurant_orders"("requestId");
CREATE INDEX "restaurant_orders_organizationId_createdAt_idx" ON "restaurant_orders"("organizationId", "createdAt");
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "restaurant_order_items" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "station" "RestaurantStation" NOT NULL,
  "course" "RestaurantCourse" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "RestaurantItemStatus" NOT NULL DEFAULT 'RECEIVED',
  "acceptedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  CONSTRAINT "restaurant_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "restaurant_order_items_station_status_idx" ON "restaurant_order_items"("station", "status");
ALTER TABLE "restaurant_order_items" ADD CONSTRAINT "restaurant_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "restaurant_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_order_items" ADD CONSTRAINT "restaurant_order_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "restaurant_menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "restaurant_item_events" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "actorId" TEXT,
  "status" "RestaurantItemStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_item_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "restaurant_item_events_itemId_createdAt_idx" ON "restaurant_item_events"("itemId", "createdAt");
ALTER TABLE "restaurant_item_events" ADD CONSTRAINT "restaurant_item_events_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "restaurant_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
