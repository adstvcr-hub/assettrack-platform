CREATE TYPE "RestaurantLoyaltyActivityType" AS ENUM ('QR_SCAN', 'VISIT_COMPLETED', 'REWARD_EARNED', 'REWARD_REDEEMED', 'MANUAL_ADJUSTMENT');
CREATE TYPE "RestaurantRewardSponsor" AS ENUM ('RESTAURANT', 'ASSETTRACK');

ALTER TABLE "organizations"
ADD COLUMN "restaurantAccessEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "restaurant_loyalty_members" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "nickname" TEXT NOT NULL,
  "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
  "marketingConsentAt" TIMESTAMP(3),
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "assettrackPoints" INTEGER NOT NULL DEFAULT 0,
  "vipTier" TEXT NOT NULL DEFAULT 'MEMBER',
  CONSTRAINT "restaurant_loyalty_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurant_loyalty_activities" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "visitId" TEXT,
  "type" "RestaurantLoyaltyActivityType" NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_loyalty_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "restaurant_reward_programs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "sponsor" "RestaurantRewardSponsor" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "pointsRequired" INTEGER NOT NULL,
  "vipTier" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "restaurant_reward_programs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_admin_events" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "organizationId" TEXT,
  "targetUserId" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_admin_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_loyalty_members_email_key" ON "restaurant_loyalty_members"("email");
CREATE INDEX "restaurant_loyalty_members_joinedAt_idx" ON "restaurant_loyalty_members"("joinedAt");
CREATE UNIQUE INDEX "restaurant_loyalty_activities_memberId_visitId_type_key" ON "restaurant_loyalty_activities"("memberId", "visitId", "type");
CREATE INDEX "restaurant_loyalty_activities_organizationId_createdAt_idx" ON "restaurant_loyalty_activities"("organizationId", "createdAt");
CREATE INDEX "restaurant_loyalty_activities_memberId_createdAt_idx" ON "restaurant_loyalty_activities"("memberId", "createdAt");
CREATE INDEX "restaurant_reward_programs_organizationId_active_idx" ON "restaurant_reward_programs"("organizationId", "active");
CREATE INDEX "restaurant_reward_programs_sponsor_active_idx" ON "restaurant_reward_programs"("sponsor", "active");
CREATE INDEX "platform_admin_events_createdAt_idx" ON "platform_admin_events"("createdAt");
CREATE INDEX "platform_admin_events_organizationId_createdAt_idx" ON "platform_admin_events"("organizationId", "createdAt");

ALTER TABLE "restaurant_loyalty_activities" ADD CONSTRAINT "restaurant_loyalty_activities_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "restaurant_loyalty_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_loyalty_activities" ADD CONSTRAINT "restaurant_loyalty_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "restaurant_loyalty_activities" ADD CONSTRAINT "restaurant_loyalty_activities_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "restaurant_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "restaurant_reward_programs" ADD CONSTRAINT "restaurant_reward_programs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
