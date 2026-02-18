-- CreateTable
CREATE TABLE "OfflineSavedContent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineSavedContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfflineSavedContent_userId_movieId_quality_key"
    ON "OfflineSavedContent"("userId", "movieId", "quality");

CREATE INDEX "OfflineSavedContent_userId_idx" ON "OfflineSavedContent"("userId");

-- AddForeignKey
ALTER TABLE "OfflineSavedContent" ADD CONSTRAINT "OfflineSavedContent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfflineSavedContent" ADD CONSTRAINT "OfflineSavedContent_movieId_fkey"
    FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
