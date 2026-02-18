-- BookFavorite
CREATE TABLE "BookFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookFavorite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BookFavorite_userId_bookId_key" ON "BookFavorite"("userId", "bookId");
CREATE INDEX "BookFavorite_userId_addedAt_idx" ON "BookFavorite"("userId", "addedAt");
ALTER TABLE "BookFavorite" ADD CONSTRAINT "BookFavorite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookFavorite" ADD CONSTRAINT "BookFavorite_bookId_fkey"
    FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MangaNewChapterCheck
CREATE TABLE "MangaNewChapterCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "mangaTitle" TEXT NOT NULL,
    "mangaCoverUrl" TEXT,
    "lastSeenChapterId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MangaNewChapterCheck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MangaNewChapterCheck_userId_mangaId_key" ON "MangaNewChapterCheck"("userId", "mangaId");
CREATE INDEX "MangaNewChapterCheck_userId_idx" ON "MangaNewChapterCheck"("userId");
ALTER TABLE "MangaNewChapterCheck" ADD CONSTRAINT "MangaNewChapterCheck_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- OfflineMangaChapter
CREATE TABLE "OfflineMangaChapter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "mangaTitle" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "chapterTitle" TEXT,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "fileSizeBytes" INTEGER,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfflineMangaChapter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OfflineMangaChapter_userId_chapterId_key" ON "OfflineMangaChapter"("userId", "chapterId");
CREATE INDEX "OfflineMangaChapter_userId_mangaId_idx" ON "OfflineMangaChapter"("userId", "mangaId");
ALTER TABLE "OfflineMangaChapter" ADD CONSTRAINT "OfflineMangaChapter_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- OfflineBook
CREATE TABLE "OfflineBook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "format" TEXT NOT NULL DEFAULT 'epub',
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfflineBook_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OfflineBook_userId_bookId_key" ON "OfflineBook"("userId", "bookId");
CREATE INDEX "OfflineBook_userId_idx" ON "OfflineBook"("userId");
ALTER TABLE "OfflineBook" ADD CONSTRAINT "OfflineBook_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineBook" ADD CONSTRAINT "OfflineBook_bookId_fkey"
    FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
