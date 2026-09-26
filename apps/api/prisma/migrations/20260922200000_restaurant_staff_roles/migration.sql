CREATE TYPE "RestaurantStaffRole" AS ENUM ('RESTAURANT_ADMIN', 'KITCHEN', 'BAR', 'WAITER');

ALTER TABLE "users"
ADD COLUMN "restaurantRole" "RestaurantStaffRole";

ALTER TABLE "restaurant_tables"
ADD COLUMN "waiterId" TEXT;

CREATE INDEX "restaurant_tables_waiterId_idx"
ON "restaurant_tables"("waiterId");

ALTER TABLE "restaurant_tables"
ADD CONSTRAINT "restaurant_tables_waiterId_fkey"
FOREIGN KEY ("waiterId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
