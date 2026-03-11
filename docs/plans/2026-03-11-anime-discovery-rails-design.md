# Anime Discovery Rails Design

Date: 2026-03-11
Status: Approved
Owner: OpenCode

## Goal

Replace the current raw anime result grid with a cleaner, Crunchyroll-style discovery experience that prioritizes curated browsing rails and keeps search as a focused secondary flow.

## Problems in Current Experience

- Default anime page presents an oversized flat result list that feels noisy and hard to scan.
- Too many titles at once creates decision fatigue.
- Search and discovery are mixed into one surface, so there is no clear "home" browsing journey.
- The page lacks category hierarchy (trending, seasonal, top rated, etc.).

## Chosen Direction

Use **curated rails as the default landing state**.

The page will feel editorial and clean by default, while still supporting search and deeper browsing.

## Information Architecture

### Hero and Search

- Keep branded hero (`Anime Discovery`) with concise supporting copy.
- Keep a search input and CTA, but reduce visual dominance.
- Search action routes into a dedicated results grid mode/page instead of replacing the default curated landing with thousands of entries.

### Default Rails (Top to Bottom)

1. Continue Watching (when session history exists)
2. Trending Now
3. New This Season
4. Most Popular
5. Top Rated
6. Classics

Each rail supports a `View all` affordance that opens a focused catalog for that specific rail intent.

## Data and Sorting Rules

AniList remains the metadata source. Rail queries use explicit sort intents:

- Trending Now -> `TRENDING_DESC`
- Most Popular -> `POPULARITY_DESC`
- Top Rated -> `SCORE_DESC`
- New This Season -> `season + seasonYear`, sorted by `POPULARITY_DESC`
- Classics -> `seasonYear <= currentYear - 8`, sorted by `POPULARITY_DESC`

Additional behavior:

- Rail payload target: 12-20 items each (faster first paint, cleaner scan).
- De-duplicate by anime ID across rails where repetition is excessive.
- Keep search result mode independent from default rails mode.
- Optional lightweight genre chips can re-query rails without turning the page into a complex filter panel.

## Card and Interaction Design

- Uniform card shape and metadata treatment across rails.
- Metadata line remains compact: `Year • Episodes`.
- Preserve existing watch/detail routing (`/anime/:id`, `/anime/:id/watch/:episodeNumber`).
- Add a lightweight `Watch` CTA on hover/focus where it fits existing visual language.

## UX and Performance Requirements

- Remove giant aggregate result count from default discovery page.
- Use per-rail skeleton loaders and independent error states.
- If one rail fails, keep other rails available and show retry only for the failed rail.
- Mobile: swipe-friendly horizontal rails.
- Desktop: horizontal scroll with snapping and proper trackpad/wheel support.
- Accessibility: semantic rail headings, keyboard focus states, focus rings.

## Error Handling

- Rail fetch failure should not collapse entire page.
- Empty rails are hidden or replaced with concise inline state.
- Watch flow continues to show clear stream-source availability messaging when no provider resolves.

## Scope Boundaries

In scope:

- Anime list page redesign into curated rails.
- Sorting/query updates to support rail intents.
- Dedicated search results behavior separation from default rails.

Out of scope for this pass:

- Full recommendation engine personalization beyond continue-watching.
- Major backend schema refactors.
- New streaming provider integrations.

## Acceptance Criteria

- Default `/anime` page loads curated rails, not a massive flat grid.
- Rails are ordered and sorted according to the defined mapping.
- Search is available and opens focused results without collapsing discovery rails UX.
- UI is cleaner and faster to scan on both desktop and mobile.
- Failures are isolated at rail level and do not break the full page.
