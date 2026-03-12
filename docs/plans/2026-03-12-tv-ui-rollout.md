# TV UI Rollout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the approved TV mockup structure to NaijasPride's Home, player, My List, and Search experiences without replacing the existing brand system.

**Architecture:** Keep the current Angular routes, services, and data flow intact. Add TV-only layout branches and shared primitives that activate from the centralized TV detection utility, while reusing existing NaijasPride typography, colors, and content APIs.

**Tech Stack:** Angular standalone components, inline component templates/styles, shared global SCSS, existing PWA/TV detection services.

---

### Task 1: Lock TV mode foundation

**Files:**
- Modify: `apps/web/src/app/core/utils/tv-detection.ts`
- Modify: `apps/web/src/app/core/services/pwa.service.ts`
- Modify: `apps/web/src/app/core/services/device.service.ts`
- Modify: `apps/web/src/app/app.component.ts`

**Steps:**
1. Keep one shared TV detection source of truth.
2. Support manual override for local QA with `?tv=1` / `?tv=0`.
3. Ensure app shell uses the same TV state everywhere.

### Task 2: Add shared TV presentation primitives

**Files:**
- Create or modify shared TV UI helpers under `apps/web/src/app/shared/`
- Modify: `apps/web/src/styles.scss`

**Steps:**
1. Create one consistent icon style based on Material Symbols Outlined.
2. Add shared TV shell classes for safe-zone, side rail, hero overlays, focus states, and poster/landscape cards.
3. Preserve NaijasPride branding tokens instead of mockup colors.

### Task 3: Rebuild Home for TV mode

**Files:**
- Modify: `apps/web/src/app/features/home/home.component.ts`

**Steps:**
1. Keep current data sources.
2. Add TV-only template branch with hero banner, left rail, and horizontal featured rails.
3. Reuse existing content sections where practical.

### Task 4: Rebuild My List for TV mode

**Files:**
- Modify: `apps/web/src/app/features/library/pages/unified-library/unified-library.component.ts`

**Steps:**
1. Add TV-only shell with side rail and simplified header.
2. Present saved content as large poster grid plus recommendation row.
3. Keep existing library data and links intact.

### Task 5: Rebuild Search for TV mode

**Files:**
- Modify: `apps/web/src/app/features/search/pages/global-search/global-search.component.ts`

**Steps:**
1. Add split-screen TV layout with query display and virtual keyboard shell.
2. Keep search API integration unchanged.
3. Present results as large focusable cards suitable for remote navigation.

### Task 6: Rebuild player chrome for TV mode

**Files:**
- Modify: `apps/web/src/app/shared/components/video-player/video-player.component.ts`
- Modify: relevant watch-room pages if layout wrapper updates are needed

**Steps:**
1. Keep existing playback logic.
2. Add TV overlay structure inspired by the mockup: title/meta, progress, large transport buttons, and utility controls.
3. Use a single icon family across all controls.

### Task 7: Verify and polish

**Files:**
- Modify any touched frontend files as needed

**Steps:**
1. Build the web app.
2. Fix template/type/style regressions.
3. Verify TV mode can be forced locally and that non-TV layouts still render.
