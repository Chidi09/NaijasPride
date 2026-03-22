-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('COMMENT_REPLY', 'COMMENT_MENTION', 'DOWNLOAD_READY');

-- CreateEnum
CREATE TYPE "DownloadRequestStatus" AS ENUM ('PENDING', 'SEARCHING', 'QUEUED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movieId" TEXT,
    "showId" TEXT,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movieId" TEXT,
    "showId" TEXT,
    "status" "DownloadRequestStatus" NOT NULL DEFAULT 'PENDING',
    "magnetLink" TEXT,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DownloadRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Comment_movieId_createdAt_idx" ON "Comment"("movieId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_showId_createdAt_idx" ON "Comment"("showId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadRequest_userId_movieId_key" ON "DownloadRequest"("userId", "movieId");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadRequest_userId_showId_key" ON "DownloadRequest"("userId", "showId");

-- CreateIndex
CREATE INDEX "DownloadRequest_status_idx" ON "DownloadRequest"("status");

-- CreateIndex
CREATE INDEX "DownloadRequest_movieId_idx" ON "DownloadRequest"("movieId");

-- CreateIndex
CREATE INDEX "DownloadRequest_showId_idx" ON "DownloadRequest"("showId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_showId_fkey" FOREIGN KEY ("showId") REFERENCES "TvShow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadRequest" ADD CONSTRAINT "DownloadRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadRequest" ADD CONSTRAINT "DownloadRequest_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadRequest" ADD CONSTRAINT "DownloadRequest_showId_fkey" FOREIGN KEY ("showId") REFERENCES "TvShow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
