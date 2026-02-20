# Auto-Library Expansion Plan

This document tracks the rollout for periodic discovery and ingestion of high-value books.

## Implemented foundation

1. Discovery service
   - `AutoLibraryDiscoveryService` added at `apps/api/src/modules/books/auto-library-discovery.service.ts`.
   - Sources:
     - Local curated must-have list (`apps/api/src/modules/books/data/must-haves.json`).
     - Google Books trending queries (`BOOK_AUTO_LIBRARY_GOOGLE_QUERIES`).

2. 1337x search + magnet extraction
   - Searches `sort-search/<query>/seeders/desc/1/`.
   - Parses torrent rows and detail pages.
   - Captures magnet URIs and info hash.

3. Quality and safety filters
   - Prioritizes EPUB/PDF over other formats.
   - Filters audiobook-style entries (`audiobook`, `.m4b`, `.mp3`, etc.).
   - Supports minimum seeder threshold (`BOOK_AUTO_LIBRARY_MIN_SEEDERS`).

4. Admin controls
   - `GET /api/v1/admin/books/auto-library/must-haves`
   - `POST /api/v1/admin/books/auto-library/discover`
   - Supports dry-run and optional DB ingestion.

5. Periodic scheduler
   - Controlled in `apps/api/src/app.ts`.
   - Feature flags:
     - `BOOK_AUTO_LIBRARY_ENABLED`
     - `BOOK_AUTO_LIBRARY_INTERVAL_MS`
     - `BOOK_AUTO_LIBRARY_INGEST`
     - `BOOK_AUTO_LIBRARY_DRY_RUN`

## Current ingestion behavior

- In ingest mode, discovered items are upserted into `Book` as `pending` records.
- `downloadUrl` currently stores the magnet URI for downstream worker processing.

## Elsci light novel source support

1. Source adapter
   - Added `apps/api/src/modules/books/external/elsci/elsci-lightnovels.ts`.
   - Uses h5ai JSON API (`POST /?` with `action=get`) to discover files under:
     - `/Officially%20Translated%20Light%20Novels/`
   - Filters to `.epub` / `.pdf`, deduplicates duplicate volume files, and supports include/exclude regex filters.

2. Import pipeline
   - Added `apps/api/src/modules/books/external/elsci/importer.ts`.
   - Upserts imported entries as `active` `Book` records with stable slug prefix `elsci-ln-...`.
   - Stores download URLs as stable internal proxy links:
     - `/api/v1/books/external/elsci/file?href=...`

3. API routes
   - `GET /api/v1/books/external/elsci/discover` (Admin) - preview candidate files.
   - `GET /api/v1/books/external/elsci/file` - stream selected source file through API.
   - `POST /api/v1/books/import/elsci-lightnovels` (Admin) - dry-run or import into DB.

4. Worker support
   - `book-import.worker` now supports `source: "elsci-lightnovels"` jobs on the existing `book-import` queue.

5. Runtime knobs
   - `ELSCI_LIGHT_NOVELS_BASE_URL`
   - `ELSCI_LIGHT_NOVELS_ROOT_PATH`
   - `ELSCI_LIGHT_NOVELS_REQUEST_TIMEOUT_MS`

## Next steps

1. Book ingest worker path for magnets
   - Add explicit `book-torrent-ingest` queue and worker.
   - Download `.epub/.pdf` from torrent and upload to R2.
   - Replace magnet `downloadUrl` with signed/public R2 URL.

2. Metadata enrichment upgrades
   - Add OpenLibrary fallback for richer ISBN/cover/page metadata.
   - Improve author-title matching score before write.

3. Notification integration
   - Add book-specific push topic for new must-have arrivals.
