-- Add TV show catalog models and watch history

CREATE TABLE "TvShow" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "overview" TEXT,
  "year" INTEGER NOT NULL,
  "genre" "Genre"[] DEFAULT ARRAY[]::"Genre"[],
  "language" TEXT NOT NULL DEFAULT 'English',
  "imdbId" TEXT,
  "tmdbId" INTEGER,
  "thumbnailUrl" TEXT,
  "posterUrl" TEXT,
  "backdropUrl" TEXT,
  "trailerUrl" TEXT,
  "status" "ContentStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TvShow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TvSeason" (
  "id" TEXT NOT NULL,
  "seasonNumber" INTEGER NOT NULL,
  "title" TEXT,
  "overview" TEXT,
  "posterUrl" TEXT,
  "showId" TEXT NOT NULL,

  CONSTRAINT "TvSeason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TvEpisode" (
  "id" TEXT NOT NULL,
  "episodeNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "overview" TEXT,
  "durationMinutes" INTEGER,
  "thumbnailUrl" TEXT,
  "seasonId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TvEpisode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TvWatchHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "showId" TEXT NOT NULL,
  "episodeId" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "duration" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TvWatchHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TvShow_slug_key" ON "TvShow"("slug");
CREATE UNIQUE INDEX "TvShow_tmdbId_key" ON "TvShow"("tmdbId");
CREATE INDEX "TvShow_slug_idx" ON "TvShow"("slug");
CREATE INDEX "TvShow_year_idx" ON "TvShow"("year");
CREATE INDEX "TvShow_status_idx" ON "TvShow"("status");

CREATE UNIQUE INDEX "TvSeason_showId_seasonNumber_key" ON "TvSeason"("showId", "seasonNumber");
CREATE INDEX "TvSeason_showId_idx" ON "TvSeason"("showId");

CREATE UNIQUE INDEX "TvEpisode_seasonId_episodeNumber_key" ON "TvEpisode"("seasonId", "episodeNumber");
CREATE INDEX "TvEpisode_seasonId_idx" ON "TvEpisode"("seasonId");

CREATE UNIQUE INDEX "TvWatchHistory_userId_showId_key" ON "TvWatchHistory"("userId", "showId");
CREATE INDEX "TvWatchHistory_showId_idx" ON "TvWatchHistory"("showId");

ALTER TABLE "TvSeason" ADD CONSTRAINT "TvSeason_showId_fkey"
  FOREIGN KEY ("showId") REFERENCES "TvShow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TvEpisode" ADD CONSTRAINT "TvEpisode_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "TvSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TvWatchHistory" ADD CONSTRAINT "TvWatchHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TvWatchHistory" ADD CONSTRAINT "TvWatchHistory_showId_fkey"
  FOREIGN KEY ("showId") REFERENCES "TvShow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
