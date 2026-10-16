ALTER TABLE "organizations"
  ADD COLUMN "restaurantDisplayName" TEXT,
  ADD COLUMN "restaurantHeaderImageData" TEXT,
  ADD COLUMN "restaurantUseHeaderImage" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "restaurantMenuBackgroundImageData" TEXT,
  ADD COLUMN "restaurantMenuBackgroundEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "restaurantMenuBackgroundPosition" TEXT NOT NULL DEFAULT 'center',
  ADD COLUMN "restaurantMenuBackgroundSize" TEXT NOT NULL DEFAULT 'cover';
