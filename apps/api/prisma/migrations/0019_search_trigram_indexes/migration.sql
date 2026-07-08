-- Enable pg_trgm extension for fast ILIKE/substring search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex: GIN trigram index on Movie.title for fast ILIKE searches
-- Without this, ILIKE '%q%' does a full sequential table scan every time.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Movie_title_trgm_idx" ON "Movie" USING GIN ("title" gin_trgm_ops);

-- CreateIndex: GIN trigram index on TvShow.title
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TvShow_title_trgm_idx" ON "TvShow" USING GIN ("title" gin_trgm_ops);
