-- Add mangaTitle and chapterTitle columns to MangaReadingProgress
-- These are stored at save-time so the history view always has a readable label
-- even if the user has no MangaFavorite row for the manga.

ALTER TABLE "MangaReadingProgress"
  ADD COLUMN IF NOT EXISTS "mangaTitle"   TEXT,
  ADD COLUMN IF NOT EXISTS "chapterTitle" TEXT;
