/*
  Add a normalized location-name key.

  The visible "name" is preserved exactly as entered by the user.
  "nameKey" is used internally to prevent equivalent duplicate names.
*/

-- Remove the previous case-sensitive unique constraint.
DROP INDEX "organization_locations_organizationId_name_key";

-- Add nameKey as nullable first so existing rows can be migrated safely.
ALTER TABLE "organization_locations"
ADD COLUMN "nameKey" TEXT;

-- Populate existing records.
-- Lowercase the name.
-- Remove common Spanish accents while deliberately preserving ñ.
-- Convert punctuation/separators to spaces.
-- Collapse repeated whitespace.
UPDATE "organization_locations"
SET "nameKey" = trim(
  regexp_replace(
    regexp_replace(
      translate(
        lower(trim("name")),
        'áéíóúüÁÉÍÓÚÜ',
        'aeiouuAEIOUU'
      ),
      '[.,;:!?¿¡''"()\[\]{}/\\|_+=*&%$#@~`´^<>-]+',
      ' ',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  )
);

-- Abort creation of the unique index if normalized duplicates exist.
-- The UNIQUE index below provides the final database-level protection.

ALTER TABLE "organization_locations"
ALTER COLUMN "nameKey" SET NOT NULL;

CREATE UNIQUE INDEX
"organization_locations_organizationId_nameKey_key"
ON "organization_locations"("organizationId", "nameKey");