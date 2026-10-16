CREATE TYPE "RestaurantInventoryUnit" AS ENUM ('UNIT', 'GRAM', 'MILLILITER');
ALTER TYPE "RestaurantInventoryMovementType" ADD VALUE 'REVERSAL';

ALTER TABLE "restaurant_inventory_products"
  ADD COLUMN "stockUnit" "RestaurantInventoryUnit" NOT NULL DEFAULT 'UNIT',
  ADD COLUMN "unitsPerPresentation" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "restaurant_recipe_ingredients" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantityPerMenuItem" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "restaurant_recipe_ingredients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_recipe_ingredients_menuItemId_productId_key" ON "restaurant_recipe_ingredients"("menuItemId", "productId");
CREATE INDEX "restaurant_recipe_ingredients_organizationId_menuItemId_idx" ON "restaurant_recipe_ingredients"("organizationId", "menuItemId");
CREATE INDEX "restaurant_recipe_ingredients_productId_idx" ON "restaurant_recipe_ingredients"("productId");
CREATE UNIQUE INDEX "restaurant_inventory_movements_orderItemId_productId_type_key" ON "restaurant_inventory_movements"("orderItemId", "productId", "type");

ALTER TABLE "restaurant_recipe_ingredients" ADD CONSTRAINT "restaurant_recipe_ingredients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_recipe_ingredients" ADD CONSTRAINT "restaurant_recipe_ingredients_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "restaurant_menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_recipe_ingredients" ADD CONSTRAINT "restaurant_recipe_ingredients_productId_fkey" FOREIGN KEY ("productId") REFERENCES "restaurant_inventory_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
