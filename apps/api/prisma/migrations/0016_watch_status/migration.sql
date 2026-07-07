-- CreateEnum
CREATE TYPE "WatchStatus" AS ENUM ('WATCHING', 'PLAN_TO_WATCH', 'ON_HOLD', 'COMPLETED', 'DROPPED');

-- AlterTable
ALTER TABLE "WatchHistory" ADD COLUMN "status" "WatchStatus" NOT NULL DEFAULT 'WATCHING';

-- AlterTable
ALTER TABLE "TvWatchHistory" ADD COLUMN "status" "WatchStatus" NOT NULL DEFAULT 'WATCHING';

-- AlterTable
ALTER TABLE "AnimeWatchHistory" ADD COLUMN "status" "WatchStatus" NOT NULL DEFAULT 'WATCHING';
