-- UserWrappedStats
CREATE TABLE "UserWrappedStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "statsJson" JSONB NOT NULL,
    "cardUrls" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserWrappedStats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserWrappedStats_userId_period_key" ON "UserWrappedStats"("userId", "period");
CREATE INDEX "UserWrappedStats_userId_idx" ON "UserWrappedStats"("userId");
CREATE INDEX "UserWrappedStats_period_idx" ON "UserWrappedStats"("period");

ALTER TABLE "UserWrappedStats" ADD CONSTRAINT "UserWrappedStats_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
