-- CreateEnum
CREATE TYPE "OrganizationLocationType" AS ENUM ('PLANT', 'WAREHOUSE', 'BRANCH', 'CLIENT_SITE', 'PROJECT_SITE', 'SERVICE_SITE', 'OTHER');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('GPS', 'ORGANIZATION_LOCATION', 'MANUAL', 'DEVICE_TIMEZONE', 'UTC_FALLBACK');

-- AlterTable
ALTER TABLE "scan_events" ADD COLUMN     "locationSource" "LocationSource",
ADD COLUMN     "organizationLocationId" TEXT;

-- CreateTable
CREATE TABLE "organization_locations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrganizationLocationType" NOT NULL DEFAULT 'OTHER',
    "country" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "timezone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_locations_organizationId_idx" ON "organization_locations"("organizationId");

-- CreateIndex
CREATE INDEX "organization_locations_active_idx" ON "organization_locations"("active");

-- CreateIndex
CREATE UNIQUE INDEX "organization_locations_organizationId_name_key" ON "organization_locations"("organizationId", "name");

-- CreateIndex
CREATE INDEX "scan_events_organizationLocationId_idx" ON "scan_events"("organizationLocationId");

-- AddForeignKey
ALTER TABLE "organization_locations" ADD CONSTRAINT "organization_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_organizationLocationId_fkey" FOREIGN KEY ("organizationLocationId") REFERENCES "organization_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
