ALTER TABLE "restaurant_inventory_movements"
  ADD COLUMN "unitSnapshot" "RestaurantInventoryUnit";

UPDATE "restaurant_inventory_movements" AS movement
SET "unitSnapshot" = product."stockUnit"
FROM "restaurant_inventory_products" AS product
WHERE product."id" = movement."productId";

CREATE TABLE "restaurant_recipe_revisions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "ingredients" JSONB NOT NULL,
  "createdById" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_recipe_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_recipe_revisions_menuItemId_version_key"
  ON "restaurant_recipe_revisions"("menuItemId", "version");
CREATE INDEX "restaurant_recipe_revisions_organizationId_createdAt_idx"
  ON "restaurant_recipe_revisions"("organizationId", "createdAt");

ALTER TABLE "restaurant_recipe_revisions"
  ADD CONSTRAINT "restaurant_recipe_revisions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_recipe_revisions"
  ADD CONSTRAINT "restaurant_recipe_revisions_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "restaurant_menu_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "restaurant_recipe_revisions" (
  "id", "organizationId", "menuItemId", "version", "ingredients", "reason"
)
SELECT
  'legacy-' || md5(ingredient."menuItemId"),
  ingredient."organizationId",
  ingredient."menuItemId",
  1,
  jsonb_agg(
    jsonb_build_object(
      'productId', ingredient."productId",
      'quantityPerMenuItem', ingredient."quantityPerMenuItem",
      'productName', product."name",
      'stockUnit', product."stockUnit"
    ) ORDER BY product."name"
  ),
  'Migración de receta existente'
FROM "restaurant_recipe_ingredients" AS ingredient
JOIN "restaurant_inventory_products" AS product
  ON product."id" = ingredient."productId"
WHERE ingredient."active" = true
GROUP BY ingredient."organizationId", ingredient."menuItemId";

ALTER TABLE "restaurant_order_items"
  ADD COLUMN "recipeRevisionId" TEXT,
  ADD COLUMN "inventoryRecipeSnapshot" JSONB,
  ADD COLUMN "comboParentId" TEXT,
  ADD COLUMN "isComboParent" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "restaurant_order_items_recipeRevisionId_idx"
  ON "restaurant_order_items"("recipeRevisionId");
CREATE INDEX "restaurant_order_items_comboParentId_idx"
  ON "restaurant_order_items"("comboParentId");

ALTER TABLE "restaurant_order_items"
  ADD CONSTRAINT "restaurant_order_items_recipeRevisionId_fkey"
  FOREIGN KEY ("recipeRevisionId") REFERENCES "restaurant_recipe_revisions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "restaurant_order_items"
  ADD CONSTRAINT "restaurant_order_items_comboParentId_fkey"
  FOREIGN KEY ("comboParentId") REFERENCES "restaurant_order_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "restaurant_order_items" AS item
SET
  "recipeRevisionId" = revision."id",
  "inventoryRecipeSnapshot" = revision."ingredients"
FROM "restaurant_recipe_revisions" AS revision
WHERE revision."menuItemId" = item."menuItemId"
  AND revision."version" = 1;

UPDATE "restaurant_order_items" AS item
SET "inventoryRecipeSnapshot" = jsonb_build_array(
  jsonb_build_object(
    'productId', product."id",
    'quantityPerMenuItem', 1,
    'productName', product."name",
    'stockUnit', product."stockUnit"
  )
)
FROM "restaurant_inventory_products" AS product
WHERE item."inventoryRecipeSnapshot" IS NULL
  AND product."menuItemId" = item."menuItemId"
  AND product."stockUnit" = 'UNIT';

CREATE TABLE "restaurant_menu_combo_components" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "parentMenuItemId" TEXT NOT NULL,
  "componentMenuItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "restaurant_menu_combo_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_menu_combo_components_parentMenuItemId_componentMenuItemId_key"
  ON "restaurant_menu_combo_components"("parentMenuItemId", "componentMenuItemId");
CREATE INDEX "restaurant_menu_combo_components_organizationId_parentMenuItemId_idx"
  ON "restaurant_menu_combo_components"("organizationId", "parentMenuItemId");
CREATE INDEX "restaurant_menu_combo_components_componentMenuItemId_idx"
  ON "restaurant_menu_combo_components"("componentMenuItemId");

ALTER TABLE "restaurant_menu_combo_components"
  ADD CONSTRAINT "restaurant_menu_combo_components_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_menu_combo_components"
  ADD CONSTRAINT "restaurant_menu_combo_components_parentMenuItemId_fkey"
  FOREIGN KEY ("parentMenuItemId") REFERENCES "restaurant_menu_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_menu_combo_components"
  ADD CONSTRAINT "restaurant_menu_combo_components_componentMenuItemId_fkey"
  FOREIGN KEY ("componentMenuItemId") REFERENCES "restaurant_menu_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
