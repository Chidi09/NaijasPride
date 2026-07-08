-- Enable pg_trgm extension for fast ILIKE/substring search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex: GIN trigram index on Movie.title for fast ILIKE searches
-- CONCURRENTLY cannot run inside a transaction (Prisma wraps migrations in one).
CREATE INDEX IF NOT EXISTS "Movie_title_trgm_idx" ON "Movie" USING GIN ("title" gin_trgm_ops);

-- CreateIndex: GIN trigram index on TvShow.title
CREATE INDEX IF NOT EXISTS "TvShow_title_trgm_idx" ON "TvShow" USING GIN ("title" gin_trgm_ops);
