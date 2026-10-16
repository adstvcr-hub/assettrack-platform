ALTER TABLE "restaurant_visits"
  ADD COLUMN "responsibleStaffId" TEXT,
  ADD COLUMN "fallbackStaffId" TEXT;

ALTER TABLE "restaurant_order_items"
  ADD COLUMN "handedOffAt" TIMESTAMP(3);

UPDATE "restaurant_visits" AS visit
SET "responsibleStaffId" = table_row."waiterId"
FROM "restaurant_tables" AS table_row
WHERE visit."tableId" = table_row."id"
  AND visit."status" = 'OPEN'
  AND table_row."waiterId" IS NOT NULL;

-- Open accounts already located at the bar predate explicit responsibility.
-- Prefer an available bartender, then an available restaurant administrator,
-- while retaining any previously assigned responsible employee as a fallback.
UPDATE "restaurant_visits" AS visit
SET "responsibleStaffId" = COALESCE(
  (
    SELECT staff."id"
    FROM "users" AS staff
    WHERE staff."organizationId" = visit."organizationId"
      AND staff."restaurantRole" = 'BAR'
      AND staff."restaurantAvailability" = 'AVAILABLE'
    ORDER BY staff."updatedAt" ASC, staff."id" ASC
    LIMIT 1
  ),
  (
    SELECT staff."id"
    FROM "users" AS staff
    WHERE staff."organizationId" = visit."organizationId"
      AND staff."restaurantAvailability" = 'AVAILABLE'
      AND (
        staff."role" IN ('OWNER', 'ADMIN')
        OR staff."restaurantRole" = 'RESTAURANT_ADMIN'
      )
    ORDER BY staff."updatedAt" ASC, staff."id" ASC
    LIMIT 1
  ),
  visit."responsibleStaffId"
)
WHERE visit."status" = 'OPEN'
  AND EXISTS (
    SELECT 1
    FROM "restaurant_tables" AS table_row
    WHERE table_row."id" = visit."tableId"
      AND table_row."kind" = 'BAR_SEAT'
  );

CREATE INDEX "restaurant_visits_responsibleStaffId_status_idx"
  ON "restaurant_visits"("responsibleStaffId", "status");

ALTER TABLE "restaurant_visits" ADD CONSTRAINT "restaurant_visits_responsibleStaffId_fkey" FOREIGN KEY ("responsibleStaffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "restaurant_visits" ADD CONSTRAINT "restaurant_visits_fallbackStaffId_fkey" FOREIGN KEY ("fallbackStaffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
