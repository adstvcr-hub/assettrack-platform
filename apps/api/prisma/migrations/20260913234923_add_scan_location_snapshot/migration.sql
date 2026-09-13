-- AlterTable
ALTER TABLE "scan_events" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "locationName" TEXT,
ADD COLUMN     "region" TEXT;
