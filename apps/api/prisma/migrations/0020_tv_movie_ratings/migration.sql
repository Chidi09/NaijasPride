-- Add TMDB rating to TvShow (previously had no rating field at all)
ALTER TABLE "TvShow" ADD COLUMN "tmdbRating" DOUBLE PRECISION;

-- Add metadataCheckedAt to Movie so the ratings backfill can skip rows
-- TMDB already failed to match, instead of retrying them on every run.
ALTER TABLE "Movie" ADD COLUMN "metadataCheckedAt" TIMESTAMP(3);

-- Speed up the backfill's "unrated, unchecked, most-viewed first" scan
-- over a catalogue in the hundreds of thousands of rows.
CREATE INDEX IF NOT EXISTS "Movie_tmdbRating_metadataCheckedAt_viewCount_idx"
  ON "Movie" ("tmdbRating", "metadataCheckedAt", "viewCount");
