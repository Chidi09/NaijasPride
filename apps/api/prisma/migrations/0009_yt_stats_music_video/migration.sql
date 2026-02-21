-- Add YouTube public stats cache fields to MusicVideo
ALTER TABLE "MusicVideo"
  ADD COLUMN IF NOT EXISTS "ytViewCount"      INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ytLikeCount"      INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ytStatsUpdatedAt" TIMESTAMP(3);
