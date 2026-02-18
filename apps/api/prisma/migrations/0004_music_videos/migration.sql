-- CreateEnum
CREATE TYPE "MusicGenre" AS ENUM ('Afrobeat', 'Afropop', 'Hip-Hop', 'R&B', 'Gospel', 'Highlife', 'Fuji', 'Reggae', 'Dancehall', 'Jazz', 'Soul', 'Pop', 'Rock', 'Amapiano', 'Traditional', 'Alternative');

-- CreateEnum
CREATE TYPE "MusicRegion" AS ENUM ('Nigeria', 'Ghana', 'SouthAfrica', 'Kenya', 'Tanzania', 'International');

-- CreateTable
CREATE TABLE "MusicVideo" (
    "id"              TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "slug"            TEXT NOT NULL,
    "artist"          TEXT NOT NULL,
    "artistSlug"      TEXT NOT NULL,
    "featuring"       TEXT[],
    "album"           TEXT,
    "year"            INTEGER NOT NULL,
    "genre"           "MusicGenre"[],
    "region"          "MusicRegion" NOT NULL DEFAULT 'Nigeria',
    "durationSeconds" INTEGER,
    "youtubeId"       TEXT NOT NULL,
    "channelId"       TEXT,
    "channelTitle"    TEXT,
    "thumbnailUrl"    TEXT,
    "hdThumbnailUrl"  TEXT,
    "isOfficial"      BOOLEAN NOT NULL DEFAULT true,
    "isExplicit"      BOOLEAN NOT NULL DEFAULT false,
    "viewCount"       INTEGER NOT NULL DEFAULT 0,
    "playCount"       INTEGER NOT NULL DEFAULT 0,
    "likeCount"       INTEGER NOT NULL DEFAULT 0,
    "weeklyPlays"     INTEGER NOT NULL DEFAULT 0,
    "status"          "ContentStatus" NOT NULL DEFAULT 'active',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "publishedAt"     TIMESTAMP(3),

    CONSTRAINT "MusicVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicWatchHistory" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "musicId"      TEXT NOT NULL,
    "progressSec"  INTEGER NOT NULL DEFAULT 0,
    "completed"    BOOLEAN NOT NULL DEFAULT false,
    "playCount"    INTEGER NOT NULL DEFAULT 1,
    "lastPlayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicWatchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicLike" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "musicId"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicPlaylist" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "description"  TEXT,
    "coverUrl"     TEXT,
    "isPublic"     BOOLEAN NOT NULL DEFAULT false,
    "isCurated"    BOOLEAN NOT NULL DEFAULT false,
    "curatedSlug"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicPlaylist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicPlaylistItem" (
    "id"         TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "musicId"    TEXT NOT NULL,
    "position"   INTEGER NOT NULL DEFAULT 0,
    "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicPlaylistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicChannel" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "channelId"     TEXT NOT NULL,
    "url"           TEXT NOT NULL,
    "artistName"    TEXT,
    "region"        "MusicRegion" NOT NULL DEFAULT 'Nigeria',
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt"  TIMESTAMP(3),
    "totalVideos"   INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MusicVideo_slug_key" ON "MusicVideo"("slug");
CREATE UNIQUE INDEX "MusicVideo_youtubeId_key" ON "MusicVideo"("youtubeId");
CREATE INDEX "MusicVideo_artistSlug_idx" ON "MusicVideo"("artistSlug");
CREATE INDEX "MusicVideo_genre_idx" ON "MusicVideo"("genre");
CREATE INDEX "MusicVideo_region_idx" ON "MusicVideo"("region");
CREATE INDEX "MusicVideo_status_weeklyPlays_idx" ON "MusicVideo"("status", "weeklyPlays");
CREATE INDEX "MusicVideo_status_playCount_idx" ON "MusicVideo"("status", "playCount");
CREATE INDEX "MusicVideo_status_createdAt_idx" ON "MusicVideo"("status", "createdAt");

CREATE UNIQUE INDEX "MusicWatchHistory_userId_musicId_key" ON "MusicWatchHistory"("userId", "musicId");
CREATE INDEX "MusicWatchHistory_userId_lastPlayedAt_idx" ON "MusicWatchHistory"("userId", "lastPlayedAt");

CREATE UNIQUE INDEX "MusicLike_userId_musicId_key" ON "MusicLike"("userId", "musicId");
CREATE INDEX "MusicLike_musicId_idx" ON "MusicLike"("musicId");

CREATE INDEX "MusicPlaylist_userId_idx" ON "MusicPlaylist"("userId");
CREATE INDEX "MusicPlaylist_isCurated_idx" ON "MusicPlaylist"("isCurated");
CREATE UNIQUE INDEX "MusicPlaylist_curatedSlug_key" ON "MusicPlaylist"("curatedSlug");

CREATE UNIQUE INDEX "MusicPlaylistItem_playlistId_musicId_key" ON "MusicPlaylistItem"("playlistId", "musicId");
CREATE INDEX "MusicPlaylistItem_playlistId_position_idx" ON "MusicPlaylistItem"("playlistId", "position");

CREATE UNIQUE INDEX "MusicChannel_channelId_key" ON "MusicChannel"("channelId");
CREATE INDEX "MusicChannel_isActive_idx" ON "MusicChannel"("isActive");

-- AddForeignKey
ALTER TABLE "MusicWatchHistory" ADD CONSTRAINT "MusicWatchHistory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicWatchHistory" ADD CONSTRAINT "MusicWatchHistory_musicId_fkey"
    FOREIGN KEY ("musicId") REFERENCES "MusicVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MusicLike" ADD CONSTRAINT "MusicLike_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicLike" ADD CONSTRAINT "MusicLike_musicId_fkey"
    FOREIGN KEY ("musicId") REFERENCES "MusicVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MusicPlaylist" ADD CONSTRAINT "MusicPlaylist_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MusicPlaylistItem" ADD CONSTRAINT "MusicPlaylistItem_playlistId_fkey"
    FOREIGN KEY ("playlistId") REFERENCES "MusicPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicPlaylistItem" ADD CONSTRAINT "MusicPlaylistItem_musicId_fkey"
    FOREIGN KEY ("musicId") REFERENCES "MusicVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
