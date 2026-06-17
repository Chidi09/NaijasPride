# TV Shows Embed Automation Design

## Goal

Add first-class TV show support to NaijasPride so users can browse shows, pick seasons/episodes, and watch immediately via embed providers, while ingestion is fully automated from TMDB (no manual admin entry).

## Scope

1. Add dedicated TV data models (`TvShow`, `TvSeason`, `TvEpisode`, `TvWatchHistory`).
2. Add automated TMDB ingestion for **Trending + Popular + Top Rated**.
3. Add TV APIs for listing, details, episode selection, and embed resolution.
4. Add frontend routes/pages for TV discovery, show detail, and watch room.
5. Reuse the existing multi-provider embed strategy with TV URL templates.

## Non-Goals (v1)

1. No downloadable TV files pipeline (embed-first only).
2. No deep editorial curation tooling for TV yet.
3. No guaranteed progress events from third-party embeds beyond providers that support postMessage.

## Current State Findings

- Current catalog is movie-centric (`Movie`, `WatchHistory`), with no TV hierarchy.
- Embed resolver currently builds movie URLs only (`/movie` templates).
- TMDB integration exists for movies; TV endpoints are not used.
- Frontend already has reusable embed player and watch-room patterns that can be extended.
- Scheduler patterns already exist in `app.ts` for background sync services.

## Architecture Decisions

### 1) Data Model (Recommended: Dedicated TV Models)

Create TV-specific tables to preserve clean hierarchy and queryability:

- `TvShow`
  - identity/meta fields: `title`, `slug`, `overview`, `year`, `genre[]`, `language`, `status`
  - provider ids: `imdbId`, `tmdbId @unique`
  - media art: `thumbnailUrl`, `posterUrl`, `backdropUrl`, `trailerUrl`
  - relations: `seasons[]`, `watchHistory[]`
- `TvSeason`
  - `showId`, `seasonNumber`, optional `title`, `overview`, `posterUrl`
  - unique `(showId, seasonNumber)`
- `TvEpisode`
  - `seasonId`, `episodeNumber`, `title`, optional `overview`, `durationMinutes`, `thumbnailUrl`
  - unique `(seasonId, episodeNumber)`
- `TvWatchHistory`
  - `userId`, `showId`, `episodeId`, `progress`, `duration`, `updatedAt`
  - unique `(userId, showId)` for continue-watching per show

Add `tvWatchHistory TvWatchHistory[]` to `User`.

### 2) Ingestion Model (Fully Automated)

Introduce a new `TvTmdbSyncService`:

- Pull TMDB discovery sets:
  - `/trending/tv/day`
  - `/tv/popular`
  - `/tv/top_rated`
- De-duplicate by TMDB ID before upsert.
- For each show:
  1. fetch `/tv/{id}` with `external_ids,videos`
  2. upsert `TvShow`
  3. iterate seasons and fetch `/tv/{id}/season/{seasonNumber}`
  4. upsert `TvSeason` and `TvEpisode` rows
- Batch limits and page depth controlled by env vars.

### 3) Playback and Embed Resolution

Extend embed resolver to support a second mode:

- **Movie mode** (existing): uses imdb/tmdb movie templates
- **TV mode** (new): uses imdb/tmdb TV templates requiring `season` + `episode`

Example TV template format:

- `https://vidsrc.me/embed/tv?imdb={imdbId}&season={season}&episode={episode}`

API endpoint:

- `GET /api/v1/tv-shows/:slug/embeds?season=1&episode=1`

### 4) API Surface

Add `tv-show` module with endpoints:

1. `GET /api/v1/tv-shows`
   - search/filter/sort pagination
2. `GET /api/v1/tv-shows/:slug`
   - show metadata with seasons + episode summaries
3. `GET /api/v1/tv-shows/:slug/embeds?season=&episode=`
   - provider list for selected episode
4. `POST /api/v1/tv-shows/sync`
   - optional admin/manual trigger (still automated by scheduler)
5. `POST /api/v1/watch/tv-progress`
   - persist current episode/progress (auth and optional guest flow parity)

### 5) Frontend UX

Add dedicated TV navigation and pages:

- `/tv-shows`
  - card grid/list with search/filter, stream-ready only
- `/tv-shows/:slug`
  - show hero, metadata, season picker, episode list
- `/tv-shows/:slug/watch?season=1&episode=1`
  - embeds selected episode using shared `EmbedPlayerComponent`

`EmbedPlayerComponent` gets optional inputs for:

- `contentType: 'movie' | 'tv'`
- `seasonNumber`
- `episodeNumber`

### 6) Scheduler Integration

Add startup + interval execution in `app.ts`:

- New env flags:
  - `TV_TMDB_SYNC_ENABLED=true`
  - `TV_TMDB_SYNC_INTERVAL_MS` (default 6h)
  - `TV_TMDB_SYNC_STARTUP_DELAY_MS` (default 90s)
  - `TV_TMDB_SYNC_MAX_SHOWS_PER_RUN`
  - `TV_TMDB_SYNC_PAGES_PER_LIST`
- First run after startup delay, then interval runs.

## Data Contracts

Add shared types and validators:

- Types:
  - `TvShow`, `TvShowSummary`, `TvSeason`, `TvEpisode`, `TvWatchHistorySummary`
- API params:
  - `TvShowSearchParams` (q, genre, year, sortBy, page, limit)
  - `TvEmbedParams` (season, episode)

Reuse existing `Genre` and `ContentStatus` enums.

## Error Handling and Guardrails

1. TMDB failures should log and continue next item (no crash-loop).
2. Upserts must be idempotent; reruns should not duplicate seasons/episodes.
3. If embeds unavailable for an episode, return empty provider list with clear message.
4. Missing `TMDB_API_KEY` disables sync gracefully and logs warning.
5. Invalid season/episode query returns `400` with validation errors.

## Performance and Limits

1. Bound per-run ingestion size with strict caps.
2. Use batched DB writes where possible.
3. Cache list/detail responses in Redis similar to movies module.
4. Keep API responses lightweight on list endpoints (summary DTO only).

## Verification Plan

1. Schema/migration
   - `prisma migrate deploy` creates TV tables and indexes successfully.
2. Ingestion
   - One sync run inserts/updates shows, seasons, episodes from all three TMDB lists.
3. APIs
   - list/detail/embed endpoints validate and return expected payloads.
4. Frontend
   - user can open TV show, pick season/episode, and play via embed.
5. Watch history
   - progress persists per user + show and resume entry appears.
6. Regression
   - movie routes and movie embeds remain unchanged and functional.

## Rollout Plan

1. Add Prisma schema + migration (`0012_tv_shows`).
2. Add shared types/validators.
3. Implement backend TV services/routes + embed resolver extension.
4. Implement frontend TV pages/routes and player wiring.
5. Add scheduler wiring and env defaults.
6. Run verification commands.
7. Deploy via blue/green process and validate live endpoints.
