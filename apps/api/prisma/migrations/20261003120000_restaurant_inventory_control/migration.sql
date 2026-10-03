CREATE TYPE "RestaurantInventoryProductType" AS ENUM ('STANDARD', 'LIQUOR');
CREATE TYPE "RestaurantInventoryMovementType" AS ENUM ('ENTRY', 'ADJUSTMENT', 'CONSUMPTION');

CREATE TABLE "restaurant_inventory_categories" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "restaurant_inventory_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurant_inventory_products" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "menuItemId" TEXT,
  "name" TEXT NOT NULL,
  "productType" "RestaurantInventoryProductType" NOT NULL DEFAULT 'STANDARD',
  "presentation" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "minimumQuantity" INTEGER NOT NULL DEFAULT 0,
  "unitCost" INTEGER NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "liquorBrand" TEXT,
  "liquorInitialTareGrams" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "restaurant_inventory_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurant_inventory_movements" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "orderItemId" TEXT,
  "type" "RestaurantInventoryMovementType" NOT NULL,
  "quantityDelta" INTEGER NOT NULL,
  "unitCost" INTEGER,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "restaurant_inventory_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurant_liquor_weighings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "grossWeightGrams" INTEGER NOT NULL,
  "netWeightGrams" INTEGER NOT NULL,
  "previousNetWeightGrams" INTEGER,
  "consumedWeightGrams" INTEGER,
  "relatedOrderQuantity" INTEGER NOT NULL DEFAULT 0,
  "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "restaurant_liquor_weighings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_inventory_categories_organizationId_name_key" ON "restaurant_inventory_categories"("organizationId", "name");
CREATE INDEX "restaurant_inventory_categories_organizationId_active_idx" ON "restaurant_inventory_categories"("organizationId", "active");
CREATE UNIQUE INDEX "restaurant_inventory_products_menuItemId_key" ON "restaurant_inventory_products"("menuItemId");
CREATE INDEX "restaurant_inventory_products_organizationId_active_idx" ON "restaurant_inventory_products"("organizationId", "active");
CREATE INDEX "restaurant_inventory_products_categoryId_idx" ON "restaurant_inventory_products"("categoryId");
CREATE INDEX "restaurant_inventory_movements_organizationId_occurredAt_idx" ON "restaurant_inventory_movements"("organizationId", "occurredAt");
CREATE INDEX "restaurant_inventory_movements_productId_occurredAt_idx" ON "restaurant_inventory_movements"("productId", "occurredAt");
CREATE INDEX "restaurant_inventory_movements_orderItemId_idx" ON "restaurant_inventory_movements"("orderItemId");
CREATE INDEX "restaurant_liquor_weighings_organizationId_measuredAt_idx" ON "restaurant_liquor_weighings"("organizationId", "measuredAt");
CREATE INDEX "restaurant_liquor_weighings_productId_measuredAt_idx" ON "restaurant_liquor_weighings"("productId", "measuredAt");

ALTER TABLE "restaurant_inventory_categories" ADD CONSTRAINT "restaurant_inventory_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_inventory_products" ADD CONSTRAINT "restaurant_inventory_products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_inventory_products" ADD CONSTRAINT "restaurant_inventory_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "restaurant_inventory_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_inventory_products" ADD CONSTRAINT "restaurant_inventory_products_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "restaurant_menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "restaurant_inventory_movements" ADD CONSTRAINT "restaurant_inventory_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_inventory_movements" ADD CONSTRAINT "restaurant_inventory_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "restaurant_inventory_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_inventory_movements" ADD CONSTRAINT "restaurant_inventory_movements_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "restaurant_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "restaurant_liquor_weighings" ADD CONSTRAINT "restaurant_liquor_weighings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_liquor_weighings" ADD CONSTRAINT "restaurant_liquor_weighings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "restaurant_inventory_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
