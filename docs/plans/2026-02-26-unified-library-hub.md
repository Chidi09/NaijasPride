# Unified Library Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a unified library hub at `/library` that aggregates stats and provides quick links to content-specific libraries, and rename the existing profile dashboard route to `/profile`.

**Architecture:**

1. Create a new standalone Angular component `UnifiedLibraryComponent` for the hub.
2. Route `/library` to this new component.
3. Update existing `/library` references in the app header and sidebar to point correctly.
4. Route `/profile` to the existing `ProfileDashboardComponent`.

**Tech Stack:** Angular 18, TailwindCSS.

---

### Task 1: Create the Unified Library Component

**Files:**

- Create: `apps/web/src/app/features/library/pages/unified-library/unified-library.component.ts`
- Create directory: `apps/web/src/app/features/library/pages/unified-library/`

**Step 1: Scaffold the basic component structure**
Create the file with necessary imports (CommonModule, RouterLink, MatCardModule, MatIconModule) and inject the `LibraryService` and `ProfileQueryService` to get stats.

**Step 2: Implement the Dashboard UI**
Build a dashboard with "Summary Cards" showing counts for: Movie Watchlist, Book Favorites, Manga Favorites, Offline Downloads. Add a "Continue" section fetching recent watch/read history.

### Task 2: Update App Routes

**Files:**

- Modify: `apps/web/src/app/app.routes.ts`

**Step 1: Remap `/library` and add `/profile`**
Change the `/library` route to load the new `UnifiedLibraryComponent`.
Add a new `/profile` route that loads the `ProfileDashboardComponent`.

### Task 3: Update Navigation Links

**Files:**

- Modify: `apps/web/src/app/core/components/side-panel/side-panel.component.ts`
- Modify: `apps/web/src/app/features/profile/pages/profile-dashboard/profile-dashboard.component.ts`
- Modify: `apps/web/src/app/core/components/app-header/app-header.component.ts`

**Step 1: Fix Profile Dashboard Title**
In `ProfileDashboardComponent`, change the header from "My Library" to "My Profile".

**Step 2: Fix App Header Dropdown**
In `app-header.component.ts`, ensure the profile dropdown points "Profile" to `/profile` and "Library" to `/library`.

**Step 3: Fix Side Panel**
Ensure the mobile side panel has distinct links for Profile and Library.

### Task 4: Verify and Build

**Files:**

- None

**Step 1: Build the web workspace**
Run `npm run build -w web` to ensure all imports and routes are correct.
