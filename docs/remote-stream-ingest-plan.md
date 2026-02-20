# Remote Stream Ingest Plan

This repository now supports a production-friendly `extract -> ingest -> re-host` flow for unstable third-party stream pages.

## Why this approach

- Direct hotlinking from mirror sites is brittle (token expiry, referer checks, mirror churn).
- Ingestion gives stable playback once media is copied to our own storage.
- Delivery from our own URLs lets us enforce auth and playback policies consistently.

## Implemented components

1. `RemoteStreamResolverService`
   - Uses Playwright to load a provider page and capture media requests.
   - Detects HLS (`.m3u8`) and MP4 candidates.
   - Supports allow-list filtering via `REMOTE_INGEST_ALLOWED_HOSTS`.

2. Admin movie routes
   - `POST /api/v1/movies/remote/resolve` resolves a source page into a playable stream URL.
   - `POST /api/v1/movies/remote/ingest` creates a pending movie and optionally queues ingest.

3. `remote-ingest.worker`
   - Consumes BullMQ queue `remote-ingest-processing`.
   - Resolves stream URL (if needed), downloads/repackages with `ffmpeg`, uploads to R2.
   - Produces MP4 and optional multi-bitrate HLS.
   - Updates movie to `active` with `fileUrls` and `fileSizes`.

4. Queue support
   - `QueueService.addRemoteIngestJob()` enqueues ingest jobs with source context.

## Runtime knobs

- `REMOTE_INGEST_ALLOWED_HOSTS`
- `REMOTE_INGEST_WORKER_CONCURRENCY`
- `REMOTE_INGEST_PACKAGE_HLS`
- `REMOTE_INGEST_TMP_DIR`
- `REMOTE_INGEST_STREAM_GATEWAY`
- `REMOTE_INGEST_JOB_ATTEMPTS`
- `REMOTE_INGEST_JOB_BACKOFF_MS`
- `SOAP2DAY_ALLOWED_MIRRORS`

## Deployment

- `docker-compose.yml` includes `remote-ingest-worker`.
- Worker uses same Redis and R2 config as existing ingest workers.

## Hardening tasks completed

- Signed gateway for HLS segments
  - `GET /api/v1/movies/stream/:movieId/*` serves playlist/segment objects through API auth.
  - Remote ingest worker can publish HLS URLs to this gateway (`REMOTE_INGEST_STREAM_GATEWAY=true`).

- Provider-specific resolver behavior
  - `provider: "soap2day"` path now applies additional selectors and iframe interaction.
  - Provider host allow-list can be configured via `SOAP2DAY_ALLOWED_MIRRORS`.

- Retry + dead-letter flow
  - Remote ingest jobs now use configurable retries/backoff.
  - Final-attempt failures are mirrored to `remote-ingest-dead-letter` queue.
  - Admin queue endpoints now expose both `remote-ingest-processing` and `remote-ingest-dead-letter`.

## Next improvements

- Cloudflare Worker edge token verification for segment URLs.
- Per-provider health metrics and mirror failover scoring.
