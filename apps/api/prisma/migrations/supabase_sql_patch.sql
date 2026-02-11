-- ============================================================
-- NaijasPride – Missing Tables Patch
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. MangaReadingProgress (tracks page-level reading progress per chapter)
CREATE TABLE IF NOT EXISTS "MangaReadingProgress" (
    "id"          TEXT        NOT NULL,
    "userId"      TEXT        NOT NULL,
    "mangaId"     TEXT        NOT NULL,
    "chapterId"   TEXT        NOT NULL,
    "pageIndex"   INTEGER     NOT NULL DEFAULT 0,
    "totalPages"  INTEGER     NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN     NOT NULL DEFAULT false,
    "lastReadAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MangaReadingProgress_pkey" PRIMARY KEY ("id")
);

-- Unique: one progress entry per user+chapter
CREATE UNIQUE INDEX IF NOT EXISTS "MangaReadingProgress_userId_chapterId_key"
    ON "MangaReadingProgress"("userId", "chapterId");

-- Fast lookup: latest read items for a user
CREATE INDEX IF NOT EXISTS "MangaReadingProgress_userId_lastReadAt_idx"
    ON "MangaReadingProgress"("userId", "lastReadAt" DESC);

-- Foreign key to User
DO $$ BEGIN
    ALTER TABLE "MangaReadingProgress"
        ADD CONSTRAINT "MangaReadingProgress_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================

-- 2. MangaFavorite (user's bookmarked manga)
CREATE TABLE IF NOT EXISTS "MangaFavorite" (
    "id"        TEXT        NOT NULL,
    "userId"    TEXT        NOT NULL,
    "mangaId"   TEXT        NOT NULL,
    "title"     TEXT        NOT NULL,
    "coverUrl"  TEXT,
    "status"    TEXT,
    "addedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MangaFavorite_pkey" PRIMARY KEY ("id")
);

-- Unique: one favourite per user+manga
CREATE UNIQUE INDEX IF NOT EXISTS "MangaFavorite_userId_mangaId_key"
    ON "MangaFavorite"("userId", "mangaId");

-- Fast lookup
CREATE INDEX IF NOT EXISTS "MangaFavorite_userId_addedAt_idx"
    ON "MangaFavorite"("userId", "addedAt" DESC);

-- Foreign key to User
DO $$ BEGIN
    ALTER TABLE "MangaFavorite"
        ADD CONSTRAINT "MangaFavorite_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================

-- 3. YouTubeChannel (configured channels for batch import & cron monitoring)
CREATE TABLE IF NOT EXISTS "YouTubeChannel" (
    "id"            TEXT        NOT NULL,
    "name"          TEXT        NOT NULL,
    "channelId"     TEXT        NOT NULL,
    "url"           TEXT        NOT NULL,
    "isActive"      BOOLEAN     NOT NULL DEFAULT true,
    "lastSyncedAt"  TIMESTAMP(3),
    "totalVideos"   INTEGER     NOT NULL DEFAULT 0,
    "importedCount" INTEGER     NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YouTubeChannel_pkey" PRIMARY KEY ("id")
);

-- Unique channelId (YouTube's UC... identifier)
CREATE UNIQUE INDEX IF NOT EXISTS "YouTubeChannel_channelId_key"
    ON "YouTubeChannel"("channelId");

-- Fast lookup for cron / active channels
CREATE INDEX IF NOT EXISTS "YouTubeChannel_isActive_idx"
    ON "YouTubeChannel"("isActive");

-- ============================================================

-- 4. Register migrations so Prisma doesn't try to re-apply them
-- (marks them as applied in _prisma_migrations table)
INSERT INTO "_prisma_migrations" (
    "id",
    "checksum",
    "finished_at",
    "migration_name",
    "logs",
    "rolled_back_at",
    "started_at",
    "applied_steps_count"
)
SELECT
    gen_random_uuid()::text,
    'manual_patch_manga_yt_channels',
    NOW(),
    'add_manga_favorites_history_yt_channels',
    NULL,
    NULL,
    NOW(),
    1
WHERE NOT EXISTS (
    SELECT 1 FROM "_prisma_migrations"
    WHERE "migration_name" = 'add_manga_favorites_history_yt_channels'
);

-- ============================================================
-- Done. Refresh your API and all features should work.
-- ============================================================
