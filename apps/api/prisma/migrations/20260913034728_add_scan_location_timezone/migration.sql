-- AlterTable
ALTER TABLE "scan_events" ADD COLUMN     "locationAccuracy" DECIMAL(10,2),
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "timezoneOffset" INTEGER;

-- CreateIndex
CREATE INDEX "scan_events_timezone_idx" ON "scan_events"("timezone");
