CREATE TABLE "staff_access_codes" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "staff_access_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_access_codes_userId_key" ON "staff_access_codes"("userId");
CREATE UNIQUE INDEX "staff_access_codes_code_key" ON "staff_access_codes"("code");
CREATE INDEX "staff_access_codes_active_idx" ON "staff_access_codes"("active");

ALTER TABLE "staff_access_codes"
  ADD CONSTRAINT "staff_access_codes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
