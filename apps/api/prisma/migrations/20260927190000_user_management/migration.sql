-- User lifecycle controls and auditable administrative actions.
ALTER TABLE "users"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deactivatedAt" TIMESTAMP(3),
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "user_management_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "targetUserId" TEXT,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_management_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_management_events_organizationId_createdAt_idx"
  ON "user_management_events"("organizationId", "createdAt");
CREATE INDEX "user_management_events_targetUserId_createdAt_idx"
  ON "user_management_events"("targetUserId", "createdAt");

ALTER TABLE "user_management_events"
  ADD CONSTRAINT "user_management_events_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
