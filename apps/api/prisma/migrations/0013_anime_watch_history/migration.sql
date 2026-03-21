-- Add anime watch history for progress tracking

CREATE TABLE "AnimeWatchHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "anilistId" INTEGER NOT NULL,
  "episodeNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "imageUrl" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "duration" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnimeWatchHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnimeWatchHistory_userId_anilistId_episodeNumber_key" ON "AnimeWatchHistory"("userId", "anilistId", "episodeNumber");
CREATE INDEX "AnimeWatchHistory_userId_updatedAt_idx" ON "AnimeWatchHistory"("userId", "updatedAt");

ALTER TABLE "AnimeWatchHistory" ADD CONSTRAINT "AnimeWatchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
