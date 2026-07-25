-- TvWatchHistory was unique on (userId, showId), so saving progress on
-- episode 2 silently overwrote episode 1's row — only the single most
-- recently watched episode of a show could ever show progress. Widen the
-- uniqueness to (userId, showId, episodeId) so every episode keeps its own
-- row; existing rows already satisfy the new, more permissive constraint.
DROP INDEX IF EXISTS "TvWatchHistory_userId_showId_key";

CREATE UNIQUE INDEX "TvWatchHistory_userId_showId_episodeId_key"
  ON "TvWatchHistory" ("userId", "showId", "episodeId");

-- Keep a non-unique lookup index for "all progress rows for this show".
CREATE INDEX IF NOT EXISTS "TvWatchHistory_userId_showId_idx"
  ON "TvWatchHistory" ("userId", "showId");
