ALTER TABLE "users"
ADD COLUMN "passwordHash" TEXT;

UPDATE "users"
SET "passwordHash" = 'TEMPORARY_PASSWORD_HASH'
WHERE "passwordHash" IS NULL;

ALTER TABLE "users"
ALTER COLUMN "passwordHash" SET NOT NULL;