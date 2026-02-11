-- AlterEnum
ALTER TYPE "Genre" ADD VALUE 'Hollywood';

-- CreateTable
CREATE TABLE "MangaReadingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL DEFAULT 0,
    "totalPages" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MangaReadingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MangaFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mangaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverUrl" TEXT,
    "status" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MangaFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YouTubeChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "totalVideos" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouTubeChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MangaReadingProgress_userId_mangaId_idx" ON "MangaReadingProgress"("userId", "mangaId");

-- CreateIndex
CREATE INDEX "MangaReadingProgress_userId_lastReadAt_idx" ON "MangaReadingProgress"("userId", "lastReadAt");

-- CreateIndex
CREATE UNIQUE INDEX "MangaReadingProgress_userId_chapterId_key" ON "MangaReadingProgress"("userId", "chapterId");

-- CreateIndex
CREATE INDEX "MangaFavorite_userId_addedAt_idx" ON "MangaFavorite"("userId", "addedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MangaFavorite_userId_mangaId_key" ON "MangaFavorite"("userId", "mangaId");

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeChannel_channelId_key" ON "YouTubeChannel"("channelId");

-- CreateIndex
CREATE INDEX "YouTubeChannel_isActive_idx" ON "YouTubeChannel"("isActive");

-- AddForeignKey
ALTER TABLE "MangaReadingProgress" ADD CONSTRAINT "MangaReadingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MangaFavorite" ADD CONSTRAINT "MangaFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

