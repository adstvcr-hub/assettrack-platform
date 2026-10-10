CREATE TABLE "service_feedback_campaigns" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "question" TEXT NOT NULL DEFAULT '¿Cómo califica el servicio recibido?',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_feedback_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_feedback_promoters" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_feedback_promoters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_feedback_votes" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "promoterId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_feedback_votes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_feedback_votes_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "service_feedback_promoters_code_key" ON "service_feedback_promoters"("code");
CREATE INDEX "service_feedback_campaigns_organizationId_active_idx" ON "service_feedback_campaigns"("organizationId", "active");
CREATE INDEX "service_feedback_promoters_organizationId_active_idx" ON "service_feedback_promoters"("organizationId", "active");
CREATE INDEX "service_feedback_promoters_campaignId_active_idx" ON "service_feedback_promoters"("campaignId", "active");
CREATE INDEX "service_feedback_votes_organizationId_createdAt_idx" ON "service_feedback_votes"("organizationId", "createdAt");
CREATE INDEX "service_feedback_votes_campaignId_createdAt_idx" ON "service_feedback_votes"("campaignId", "createdAt");
CREATE INDEX "service_feedback_votes_promoterId_createdAt_idx" ON "service_feedback_votes"("promoterId", "createdAt");

ALTER TABLE "service_feedback_campaigns" ADD CONSTRAINT "service_feedback_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_feedback_campaigns" ADD CONSTRAINT "service_feedback_campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_feedback_promoters" ADD CONSTRAINT "service_feedback_promoters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_feedback_promoters" ADD CONSTRAINT "service_feedback_promoters_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "service_feedback_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_feedback_votes" ADD CONSTRAINT "service_feedback_votes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_feedback_votes" ADD CONSTRAINT "service_feedback_votes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "service_feedback_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_feedback_votes" ADD CONSTRAINT "service_feedback_votes_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "service_feedback_promoters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
