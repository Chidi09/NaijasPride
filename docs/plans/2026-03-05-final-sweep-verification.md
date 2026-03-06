# Final Sweep Verification (Movies + Ads + Progress)

Date: 2026-03-05

## Build Verification

- API build: `npm run build --workspace api` -> PASS
- Web type-check: `npx tsc -p tsconfig.json --noEmit` (in `apps/web`) -> PASS
- Web production build: `npx ng build --configuration production` (in `apps/web`) -> PASS

## Endpoint Matrix (Route Presence)

- Movies watch progress/history:
  - `apps/api/src/modules/users/watch.routes.ts`
  - `POST /progress`
  - `GET /progress/:movieId`
  - `GET /history`
- Books progress:
  - `apps/api/src/modules/books/books.routes.ts`
  - `GET /progress/:slug`
  - `POST /progress`
- Manga progress/history:
  - `apps/api/src/modules/books/books.routes.ts`
  - `GET /manga/progress/:chapterId`
  - `POST /manga/progress`
  - `GET /manga/history`
- Profile/watchlist:
  - `apps/api/src/modules/users/profile.routes.ts`
  - `GET /`
  - `POST /watchlist`

## UX/Visual Sweep Outcomes

- Grayscale classes removed from updated editorial/listing surfaces.
- Dull image opacity reduced/removed on movie and book cards where progress bars are now present.
- Progress bars now visible across major movies/books/novels surfaces:
  - movie list/editorial/download-only/stream-only/home/library
  - books editorial/book list/light novels/library/home

## Author Backfill Script

- Added: `tools/scripts/backfill-book-authors.ts`
- Added npm entry: `book-authors:backfill` (dry-run by default)
- Dry-run execution currently blocked by DB auth in this environment (invalid credentials in local `.env`).
- Intended run sequence:
  1. `npm run book-authors:backfill -- --limit 200` (dry-run sample)
  2. `cd apps/api && npx ts-node --transpile-only --compiler-options "{\"moduleResolution\":\"NodeNext\"}" ../../tools/scripts/backfill-book-authors.ts --write --limit 5000`

## Remaining Live Validation

The only outstanding step for full closure is live dummy-user verification in a working environment:

- non-premium: ad scripts/slots present; long-press + progress updates confirmed
- premium: no ads/scripts/slots anywhere; progress/watchlist unchanged
- Elsci cadence check: worker logs + queue cadence in deployed stack
