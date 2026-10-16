-- CreateTable
CREATE TABLE "restaurant_staff_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "initialAvailability" "RestaurantStaffAvailability" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "restaurant_staff_sessions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "restaurantStaffSessionId" TEXT;

-- CreateIndex
CREATE INDEX "restaurant_staff_sessions_organizationId_startedAt_idx" ON "restaurant_staff_sessions"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "restaurant_staff_sessions_userId_startedAt_idx" ON "restaurant_staff_sessions"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "restaurant_staff_sessions_organizationId_endedAt_idx" ON "restaurant_staff_sessions"("organizationId", "endedAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_restaurantStaffSessionId_idx" ON "refresh_tokens"("restaurantStaffSessionId");

-- AddForeignKey
ALTER TABLE "restaurant_staff_sessions" ADD CONSTRAINT "restaurant_staff_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_staff_sessions" ADD CONSTRAINT "restaurant_staff_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_restaurantStaffSessionId_fkey" FOREIGN KEY ("restaurantStaffSessionId") REFERENCES "restaurant_staff_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
