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
- `SOAP2DAY_ALLOWED_MIRRORS` (reserved for provider-specific filtering)

## Deployment

- `docker-compose.yml` includes `remote-ingest-worker`.
- Worker uses same Redis and R2 config as existing ingest workers.

## Next hardening steps

- Add signed-URL gateway for segment access at edge (Cloudflare Worker).
- Add provider-specific resolvers (Soap2Day mirror map + anti-bot selectors).
- Add ingest retry policy and dead-letter queue dashboards.
