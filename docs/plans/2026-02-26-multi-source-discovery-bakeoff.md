# Multi-Source Discovery Bakeoff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate three discovery approaches (direct, API, hybrid), discard failing ones, and keep the winner that can burst-ingest 10 movies per source and convert them to active within the 6/12h gates.

**Architecture:** Extend torrent discovery with source-type adapters so one ingestion pipeline can consume HTML listings and JSON feeds. Add scheduler-level approach mode and bakeoff elimination gates using run metrics plus DB conversion counts. Keep existing dedupe and queueing logic intact.

**Tech Stack:** Fastify, Prisma, BullMQ, TypeScript, Node test runner.

---

### Task 1: Add parser coverage for API sources

**Files:**

- Modify: `apps/api/src/modules/movies/torrent-discovery.service.test.ts`
- Modify: `apps/api/src/modules/movies/torrent-discovery.service.ts`

**Step 1: Write failing tests for YTS and Pirate Bay JSON parsing**

Add tests that assert title/year/seeds/hash extraction and magnet-link construction.

**Step 2: Run type-check to confirm failure**

Run: `cd apps/api && npx tsc --noEmit`
Expected: missing exports for new parser helpers.

**Step 3: Implement minimal parser helpers**

Add `parseYtsListingJson` and `parseApibayListingJson` and export them.

**Step 4: Re-run tests**

Run: `cd apps/api && npm run build && node --test "dist/modules/movies/torrent-discovery.service.test.js"`
Expected: pass.

### Task 2: Extend discovery service for source types

**Files:**

- Modify: `apps/api/src/modules/movies/torrent-discovery.service.ts`

**Step 1: Add config fields**

Introduce `sourceType`, `approachName`, and `minSeeders` config knobs.

**Step 2: Route run flow by source type**

Keep existing 1337x HTML flow; add JSON branches that resolve magnet-ready candidates directly.

**Step 3: Add source metadata**

Persist `discoveryApproach` and `discoverySourceType` into movie metadata.

**Step 4: Verify compile**

Run: `cd apps/api && npx tsc --noEmit`
Expected: pass.

### Task 3: Add scheduler approach and bakeoff elimination

**Files:**

- Modify: `apps/api/src/app.ts`

**Step 1: Add source groups and approach mode**

Wire direct (1337x family), API (YTS + Pirate Bay API), hybrid, and bakeoff mode.

**Step 2: Add gate checks**

Evaluate burst gate (`>=10 created + queued`) and conversion gate (`>=10 active in 12h`, plus 6h visibility).

**Step 3: Add discard/winner logic**

In bakeoff mode, discard failing approaches and lock the winner when conversion gate passes.

**Step 4: Verify compile**

Run: `cd apps/api && npx tsc --noEmit`
Expected: pass.

### Task 4: Expose new env knobs for operations

**Files:**

- Modify: `.env.example`
- Modify: `apps/api/.env.production.example`

**Step 1: Add variables**

Document approach mode, min seeders, per-source caps, and YTS/PirateBay source lists.

**Step 2: Verify no syntax drift**

Run: `cd apps/api && npx tsc --noEmit`
Expected: pass.

### Task 5: Verification checklist

**Files:**

- None

**Step 1: Build and run focused tests**

Run:

- `cd apps/api && npm run build`
- `cd apps/api && node --test "dist/modules/movies/torrent-discovery.service.test.js"`

**Step 2: Runtime validation on server**

Run on host:

- check startup log for `approachMode`, source counts, and `minSeeders`
- verify source run logs include gate object (`burstPass`, `conversionPass`, `activeWithin6h`, `activeWithin12h`)

**Step 3: Production gate confirmation**

Confirm winner only after a source shows:

- one run with 10 queued/created
- and 10 active within 12h (6h preferred).
