-- CreateTable
CREATE TABLE "BookHighlight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "cfiRange" TEXT,
    "excerpt" TEXT,
    "page" INTEGER,
    "rect" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookHighlight_userId_bookId_idx" ON "BookHighlight"("userId", "bookId");

-- CreateIndex
CREATE INDEX "BookHighlight_bookId_idx" ON "BookHighlight"("bookId");

-- AddForeignKey
ALTER TABLE "BookHighlight" ADD CONSTRAINT "BookHighlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookHighlight" ADD CONSTRAINT "BookHighlight_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
