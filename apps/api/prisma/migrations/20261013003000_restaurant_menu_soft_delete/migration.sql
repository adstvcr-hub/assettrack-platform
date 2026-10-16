ALTER TABLE "restaurant_menu_items"
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "restaurant_menu_items_organizationId_deletedAt_idx"
ON "restaurant_menu_items"("organizationId", "deletedAt");
