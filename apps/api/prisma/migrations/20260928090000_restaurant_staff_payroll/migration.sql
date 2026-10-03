CREATE TYPE "RestaurantPayPeriod" AS ENUM ('HOURLY', 'DAILY', 'MONTHLY');

ALTER TABLE "users"
ADD COLUMN "restaurantPayPeriod" "RestaurantPayPeriod",
ADD COLUMN "restaurantPayRate" INTEGER,
ADD COLUMN "restaurantStandardMinutesPerDay" INTEGER NOT NULL DEFAULT 480,
ADD COLUMN "restaurantWorkDaysPerMonth" INTEGER NOT NULL DEFAULT 26,
ADD COLUMN "restaurantCcssDeductionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "restaurantCcssDeductionBps" INTEGER NOT NULL DEFAULT 0;
