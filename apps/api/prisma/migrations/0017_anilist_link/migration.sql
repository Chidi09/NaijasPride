-- CreateTable
CREATE TABLE "AniListAccountLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "anilistUserId" INTEGER NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AniListAccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AniListAccountLink_userId_key" ON "AniListAccountLink"("userId");

-- AddForeignKey
ALTER TABLE "AniListAccountLink" ADD CONSTRAINT "AniListAccountLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
