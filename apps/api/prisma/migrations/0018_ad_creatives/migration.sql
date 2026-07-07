-- CreateEnum
CREATE TYPE "AdPlacement" AS ENUM ('HOME_FEED', 'BROWSE_GRID', 'DETAIL', 'PLAYER_END', 'TV_HERO');

-- CreateTable
CREATE TABLE "AdCreative" (
    "id" TEXT NOT NULL,
    "placement" "AdPlacement" NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "targetUrl" TEXT,
    "ctaLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCreative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCreative_placement_isActive_idx" ON "AdCreative"("placement", "isActive");
