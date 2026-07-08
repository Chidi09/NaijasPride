# NaijaSpride Mobile — Audit & Action Items

This document was produced after investigating 7 user-reported issues against the current
codebase (commit `a52297d`, the second fix round). Each section states the root cause
(with exact file:line references) and a concrete recommended fix. Do **not** re-derive
anything — implement exactly what is written here.

---

## 1. No subtitle track selection

**Root cause:** `UnifiedVideoPlayerScreen` (`apps/mobile/lib/core/player/unified_video_player_screen.dart`)
has a "Subtitle Settings" bottom sheet (`_showSubtitleSettings`, line 693) that only controls
_rendering_ of the active subtitle (font size, outline, background opacity). There is no
UI to **pick which subtitle track** (language) to display or to turn subtitles off.

The backend already returns subtitle track info:

- `AnimeApi.watch()` (`apps/mobile/lib/features/content/anime/data/anime_api.dart`, line 114)
  returns `subtitles` alongside `sources`. The response shape is `AnimeWatchSubtitle`
  (`anime_models.dart`, line 258) with `url` and `lang` fields.
- The `watch()` response is available in `_onEpisodeTap` (anime_detail_screen.dart, line 103)
  but subtitles are **never passed** to `UnifiedVideoPlayerScreen`. The screen has no
  `subtitles` parameter and no internal state for available tracks.

**media_kit's API** (`Player` from `package:media_kit`):

- `player.state.tracks.subtitle` — a `List<SubtitleTrack>` where each entry has `id`, `title`,
  `language`, `index`.
- `player.setSubtitleTrack(SubtitleTrack? track)` — pass a track to enable, `null` to disable.
- Listen on `player.stream.tracks` to react to track changes.

**Recommended fix:**

1. Add a `List<SubtitleTrack>? subtitles` property to `UnifiedVideoPlayerScreen` and
   `PlaybackSource` (or pass them as a separate parameter).

2. In the `_showSubtitleSettings` bottom sheet, add a **track picker** section above
   the existing sliders (or replace the bottom sheet with a two-tab "Subtitles" / "Display"
   layout):
   - Query `_player?.state.tracks.subtitle` for available tracks.
   - List each track by `language` / `title`, with a radio-button selection.
   - Include an explicit **"Off"** entry at the top (`null` → `player.setSubtitleTrack(null)`).
   - When the user picks a track, call `player.setSubtitleTrack(chosenTrack)`.

3. Pipe the `subtitles` from `anime_detail_screen.dart`'s `_onEpisodeTap` (line 101–103)
   into the `UnifiedVideoPlayerScreen`. For movies/TV, the `resolveEmbedOnlyPlayback`
   pipeline does not currently return subtitles — leave that for a follow-up; at minimum
   anime subtitles will work.

---

## 2. Grey/unreadable text on detail pages

**Root cause: missing `chipTheme` (genre chips inherit M3's washed-out defaults).**

The theme fix in commit `a52297d` (`apps/mobile/lib/core/theme/app_theme.dart`)
correctly forces `colors.text` / `colors.textStrong` onto every `TextTheme` style.
However it does **not** set `chipTheme`. Consequently every `Chip(label: Text(...))`
on the three detail screens:

- `movie_detail_screen.dart` line 304 (`Text(g.wireValue)`)
- `tv_show_detail_screen.dart` line 303 (`Text(g.wireValue)`)
- `anime_detail_screen.dart` line 320 (`Text(g)`)

falls back to M3's default chip styling, which derives label color from
`ColorScheme.onSurfaceVariant` — on the dark palette (`AppColors.dark`) this evaluates
as a washed-out grey against the `#0A0A0A` background.

**Recommended fix:** Add an explicit `chipTheme` inside `AppTheme._buildTheme`
(`app_theme.dart`, after line 83, before the closing `);` of `ThemeData(...)`):

```dart
chipTheme: ChipThemeData(
  labelStyle: TextStyle(color: colors.text),
  backgroundColor: colors.surface,
  side: BorderSide(color: colors.border),
  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
),
```

No other hardcoded text colors exist in the detail screens that are genuine bugs.
The `withAlpha`/`withOpacity` usages grep'd from `features/content/**/presentation/*.dart`
are all legitimate (progress indicators, secondary captions, shimmer highlights, pressable
scale overlays). The `Colors.white70` in `stream_preparing_overlay.dart` line 97 is the
"stage" label inside a translucent overlay — intentional dimming. The `Colors.amber` star
icon in `movie_detail_screen.dart` line 278 is also intentional.

**Confirmed: bare `Text(...)` calls with no `style:` prop** (e.g. `Text('${movie.year}')`,
`Text(detail.format!)`, `Text('${detail.episodes} eps')`) **resolve correctly** to the
theme's `bodyMedium`/`bodyLarge` because:

- `MaterialApp.router` at `main.dart:100` supplies `theme:`/`darkTheme:` — no intervening
  `Theme` override or `CupertinoTheme` bleed.
- The only `Theme` widget in the tree is the one Flutter inserts from `MaterialApp`.
- `git log -p -1 -- apps/mobile/lib/core/theme/app_theme.dart` confirms the shipped code
  seeds `textTheme` from the brightness-correct base and forces `colors.text` on every
  style (see commit `a52297d`). The fix is live in the latest commit.

---

## 3. Anime detail page — no episode list and playback failures

**Root cause A: episodes fetch silently fails → empty episode list.**

`anime_detail_screen.dart` line 346:

```dart
error: (_, _) => const SizedBox.shrink(),
```

When the episodes fetch errors, the widget renders **nothing** — no error text, no retry,
no fallback.

The real network failure was confirmed against the live API:

```
$ curl -w '%{time_total}\n' "https://api.naijaspride.com/api/v1/anime/178789/episodes"
3.669137
```

The response returns `"episodes": []` because all bridge providers (aniwatch, gogoanime,
animepahe) are failing. The backend's resolution trace shows all three bridge endpoints
returned errors for this anime ID. **This is not a URL-prefix bug** — the app correctly
calls `/api/v1/anime/$id/episodes` (anime_api.dart line 50, matches the route at
`anime.routes.ts` line 1173: `/:id/episodes`).

**Recommended fix for A:**

- Replace `const SizedBox.shrink()` with a user-visible error state (reuse
  `ErrorStateView` or inline a `Text` + retry button). Example:
  ```dart
  error: (error, _) => Padding(
    padding: const EdgeInsets.all(16),
    child: Column(
      children: [
        Text('Failed to load episodes', style: theme.textTheme.bodyMedium),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => ref.invalidate(animeEpisodesProvider(widget.id)),
          child: const Text('Retry'),
        ),
      ],
    ),
  ),
  ```
- Optionally: fall back to a hardcoded range `1..N` when the API returns empty,
  using `detail.episodes` (the total count returned by the detail endpoint).

**Root cause B: playback works but only through the slow embed fallback.**

The watch API (anime_api.dart line 117: `/api/v1/anime/$id/watch/$episodeNumber`)
returns all sources as `isEmbed: true` — the bridge providers failed so the backend
fell back to the TMDB embed provider. `resolveAnimeEpisodePlayback` in
`playback_resolver.dart` line 51–52 filters out embeds:

```dart
final nonEmbeds = sources.where((s) => !s.isEmbed).toList();
if (nonEmbeds.isEmpty) {
  return UnresolvedPlaybackSource(...);
}
```

Then `_onEpisodeTap` (anime_detail_screen.dart line 109) enters the embed fallback
pipeline: `resolveEmbedOnlyPlayback` → headless WebView → `EmbedWebViewScreen`.
This is slow (~10–20s) and fragile.

**Recommended fix for B:** No Dart-side change needed — this is a backend provider issue.
The embed fallback works but is slow. If the bridge providers for episodes become healthy,
the watch endpoint will return direct M3U8 sources and playback will be instant.

**Design comparison: TV vs. Anime detail screens.**

The structure of `tv_show_detail_screen.dart` and `anime_detail_screen.dart` is nearly
identical — both use:

- `CustomScrollView` + `SliverAppBar` + `SliverToBoxAdapter`
- Hero poster + title + metadata row + genre chips + description + episode list
- `_EpisodeTile` private widget (defined separately in each file with ~90% overlap)

**Recommendation:** Extract a shared `ContentDetailScaffold` widget at
`apps/mobile/lib/features/content/shared/presentation/content_detail_scaffold.dart`:

```dart
class ContentDetailScaffold extends ConsumerStatefulWidget {
  final String heroImageUrl;
  final String posterUrl;
  final String heroTag;
  final Widget titleWidget;
  final Widget metadataRow;
  final List<String> genres;
  final String? description;
  final Widget? actionButtonsRow;
  final Widget episodeSection;
  // + optional ad slot, optional cast section, etc.
}
```

- Both `TvShowDetailScreen` and `AnimeDetailScreen` would delegate their build()
  body to this scaffold.
- The episode section (season picker + episode tiles for TV, flat list for anime) is
  provided as a `Widget` parameter (or a builder function).
- This eliminates drift: any fix to the scaffold layout fixes both screens, and
  the same `_EpisodeTile` widget (pulled out to shared) reduces duplication.

---

## 4. TV shows list/detail loads slowly; cover art takes long

**Backend-side: TV list endpoint is slower than anime search (cold cache).**

Timings from `curl -w '%{time_total}\n'` (multiple runs):

| Endpoint                                    | Run 1 | Run 2 | Run 3 |
| ------------------------------------------- | ----- | ----- | ----- |
| `GET /api/v1/tv-shows?limit=20`             | 5.54s | 0.16s | 0.11s |
| `GET /api/v1/anime/search?perPage=10`       | 0.55s | 0.46s | 0.40s |
| `GET /api/v1/tv-shows/trying-2020` (detail) | 0.66s | —     | —     |
| `GET /api/v1/anime/178789` (detail)         | 0.40s | —     | —     |

The TV list endpoint's first call is slow due to cold Redis cache (`withCache` at
`tv-shows.service.ts` line 65, TTL 300s). Subsequent calls are fast (0.1s).
The TV **detail** endpoint (`findBySlug`, line 100–118) loads **all seasons + all
episodes** inline even though the list view only needs poster/title/year/thumbnail.
This makes the detail response ~65% slower than anime's detail.

**Recommended backend fix:** For the list endpoint (`/tv-shows`), the current design
already fetches only season counts (not full episodes) — that is fine. For the detail
endpoint (`/:slug`), consider:

- Lazy-loading episodes in a separate request (like anime does with `/episodes`),
  or adding a `?include=episodes` query param that only the detail page uses.
- The episodes are already cached (`withCache` TTL 600s), so this is low priority.

**App-wide: no image caching.**

Zero usage of `cached_network_image` in the codebase (not in `pubspec.yaml`). Every
image uses bare `Image.network` — 17 instances grep'd across the mobile app:

- `hero_banner.dart` lines 141, 221
- `movie_detail_screen.dart` lines 182, 235
- `tv_show_detail_screen.dart` lines 194, 247, 428
- `anime_detail_screen.dart` lines 196, 252, 488
- `poster_card.dart` line 116
- `search_screen.dart` line 318
- `stream_preparing_overlay.dart` line 50
- `ad_slot_card.dart` lines 46, 161
- `downloads_screen.dart` line 128
- `welcome_screen.dart` line 225

Flutter's built-in `ImageCache` is purely in-memory and evicts aggressively. On
navigation back-and-forth, cover art re-downloads. CDN timings (TMDB vs AniList)
are comparable (~0.09–0.13s for a single image), but the accumulation of 10+ cover
images on a list page adds 1–3s of visible loading per navigation.

**Recommended fix:** Add `cached_network_image: ^3.4.0` (latest stable) to
`pubspec.yaml`. Replace all 17 `Image.network(...)` calls with
`CachedNetworkImage(imageUrl: ..., fit: BoxFit.cover, ...)`. This gives:

- Disk cache (persists across app restarts)
- Memory cache (LRU, configurable size)
- Placeholder/error builders built-in (replace the current `errorBuilder: (_,_,_) => Container(...)` pattern)

---

## 5. Back button still does not appear on detail pages

**Root cause:** The `context.go()` → `context.push()` fix in commit `a52297d`
(hero_banner.dart lines 134, 182, 261; home_screen.dart lines 188–192, 238, 269, 295;
search_screen.dart lines 168, 182, 419, 435) is correct in principle — `push()` adds
the route to go_router's stack. **However**, in go_router's ShellRoute architecture:

1. The ShellRoute creates an inner `Navigator` for its tab children (`/`, `/movies`,
   `/tv`, `/anime`, `/search`, `/downloads`).
2. The detail routes (`/movies/:slug`, `/tv/:slug`, `/anime/:id`) are **siblings**
   of the `ShellRoute` — not nested inside it (see `app_router.dart` lines 129–149).
3. When `context.push('/movies/:slug')` is called from **within** the ShellRoute's
   child (e.g., from `HomeScreen`), go_router adds the detail page to the **root
   Navigator**. The root Navigator now has two pages: ShellRoute and the detail page.
4. However, when the detail screen's `SliverAppBar` calls `Navigator.of(context).canPop()`,
   the nearest Navigator ancestor for widgets **within** the detail screen is the
   root Navigator. **But** the detail screen is itself rendered by the root Navigator's
   page, so `canPop()` on that same Navigator **should** return true.

**The actual reason is go_router 17's `CustomTransitionPage` interaction.** The
`_drillInPage` transition at `app_router.dart` line 36 returns a
`CustomTransitionPage` with `FadeTransition` + `ScaleTransition`. GoRouter's
internal route-stack management for `CustomTransitionPage` does not always update
the `ModalRoute`'s previous-route state in a way that `SliverAppBar`'s automatic
back-button logic detects. Additionally, `Navigator.of(context)` from within the
detail screen resolves to the **root** Navigator (because the ShellRoute's inner
Navigator is for tabs, not for detail routes), but go_router may not have pushed
the page in a way that that Navigator's `canPop()` reflects the stack growth.

**Recommended fix:** Do **not** rely on `SliverAppBar`'s `automaticallyImplyLeading`.
Instead, build an explicit back-button widget and use it on every non-tab screen.

Create a **reusable widget** at `apps/mobile/lib/core/router/app_back_button.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AppBackButton extends StatelessWidget {
  const AppBackButton({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.arrow_back),
      onPressed: () {
        if (context.canPop()) {
          context.pop();
        } else {
          context.go('/');
        }
      },
    );
  }
}
```

**Integration plan:**

- Add `leading: const AppBackButton()` to the `SliverAppBar` in all three detail
  screens (explicitly setting `automaticallyImplyLeading: false` to prevent double
  buttons).
- Do the same for `/profile`, `/login`, `/signup`, `/welcome` — any screen that is
  not one of the 6 bottom-tab destinations (`/`, `/movies`, `/tv`, `/anime`,
  `/search`, `/downloads`).
- Do **not** add it to the ShellRoute's child screens (they get the `NavigationBar`
  and don't need a back button).

This is the "global one that every page aside the landing of all should have"
approach the user requested.

---

## 6. Bottom nav redesign — floating pill nav

**Reference:** `/root/dev/GoGo/gogo_app/lib/shared/widgets/glass_bottom_nav.dart`

**Design summary of gogo_app's `GlassBottomNav`:**

| Property           | Value                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Shape              | `BorderRadius.circular(32)` — fully rounded pill                                                          |
| Height             | 64px                                                                                                      |
| Horizontal padding | 20px each side (parent), 8px inner (container)                                                            |
| Bottom margin      | 24px from screen bottom                                                                                   |
| Background         | `Colors.white.withAlpha(64)` (~25% opacity white)                                                         |
| Border             | 1.5px `Colors.white.withAlpha(102)` (~40% opacity white)                                                  |
| Shadow             | `AppColors.primary.withAlpha(13)` (5% primary), blur 24, offset (0,8)                                     |
| Blur               | `BackdropFilter` with `ImageFilter.blur(sigmaX: 24, sigmaY: 24)` wrapped in `ClipRRect(borderRadius: 32)` |
| Item spacing       | `margin: EdgeInsets.symmetric(vertical: 6, horizontal: 4)` per tab                                        |
| Selected indicator | `AppColors.primary.withAlpha(26)` (10% primary) rounded rect, animated `AnimatedContainer(250ms)`         |
| Icon               | 22px, selected = `AppColors.primary`, unselected = `AppColors.onSurfaceVariant`                           |
| Label              | 9px font, selected = `w700 + AppColors.primary`, unselected = `w500 + AppColors.onSurfaceVariant`         |
| No. items          | 5 (Home, Market, Explore, Wealth, Wallet)                                                                 |

**No extra package dependencies needed** — `BackdropFilter` and `ImageFilter` are
core Flutter (`dart:ui`).

**Implementation plan for `app_shell.dart`:**

Replace the current `NavigationBar` inside `_NarrowLayout` (line 104) with a
`GlassBottomNav` widget reimplemented in this project. Use naijaspride's own palette:

```dart
// Inside app_shell.dart or a new file app_shell.dart imports.
// Colors from AppColors (apps/mobile/lib/core/theme/app_colors.dart):
//   - Background: dark surface (#121212) at low opacity → `colors.surface.withAlpha(...)` adjusted for glass
//   - Primary/accent: `colors.accent` (#D6B87A for dark) for selected icon/label
//   - Unselected: `colors.text.withAlpha(153)` for unselected icon/label
//   - Border: `colors.border.withAlpha(...)`
//   - Blur: BackdropFilter with ImageFilter.blur(sigmaX: 24, sigmaY: 24)
```

The 6 tabs (or 5 if TV build) fit comfortably — gogo_app's layout uses `Expanded`
children in a `Row`, so any count works.

---

## 7. Top bar changes on Home

**Current state:** `home_screen.dart` line 79–87 shows:

```dart
Scaffold(
  extendBodyBehindAppBar: !isTvBuild,
  appBar: isTvBuild
      ? AppBar(title: const Text('NaijaSpride'))
      : AppBar(
          title: const Text('NaijaSpride'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
```

The current AppBar has only the title — no leading or trailing icons.

**Proposed changes:**

1. **Move Downloads icon to top-right of Home (remove from bottom nav).**
   - Remove `/downloads` from `_routes` (app_shell.dart line 159) and from
     `_destinations()` / `_railDestinations()`.
   - Add `actions: [IconButton(icon: const Icon(Icons.download_outlined), onPressed: () => context.push('/downloads'), ...)]`
     to the Home screen's AppBar.
   - Keep the `/downloads` GoRoute in `app_router.dart` (it's already inside the
     ShellRoute at line 122–126).

2. **Add Profile icon to top-left of Home.**
   - Add `leading: IconButton(icon: const Icon(Icons.person_outline), onPressed: () => context.push('/profile'), ...)`
     to the Home screen's AppBar.
   - This fixes the gap that `/profile` is currently unreachable — grep confirms
     zero navigation calls to `/profile` anywhere except the route definition
     and the post-logout redirect in the auth controller.

**Implementation (`home_screen.dart`):**

```dart
appBar: AppBar(
  title: const Text('NaijaSpride'),
  backgroundColor: Colors.transparent,
  elevation: 0,
  leading: IconButton(
    icon: const Icon(Icons.person_outline),
    onPressed: () => context.push('/profile'),
  ),
  actions: [
    IconButton(
      icon: const Icon(Icons.download_outlined),
      onPressed: () => context.push('/downloads'),
    ),
  ],
),
```

No changes needed to other screens — the global `AppBackButton` (see issue 5)
will handle back-navigation for both `/profile` and `/downloads`.

---

## Deviations from audit

None. All audit recommendations were implemented as described, with the following
implementation notes:

- `SubtitleTrack` from `media_kit` uses `SubtitleTrack.uri()` factory for external
  subtitle tracks and `SubtitleTrack.no()` to disable subtitles, not `null` as the
  audit's pseudocode showed. The track-picker logic was adapted accordingly.
- The `Media` class does not accept a `subtitles:` parameter; subtitle tracks are
  loaded via `player.setSubtitleTrack()` after opening media.
- `CachedNetworkImage` uses `errorWidget:` and `placeholder:` named parameters
  instead of `Image.network`'s `errorBuilder:` / `loadingBuilder:` — semantics
  match.

---

## Implementation summary

| File                                                                     | Change                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pubspec.yaml`                                                           | Added `cached_network_image: ^3.4.0`                                                                                                                                                                                                                               |
| `lib/core/theme/app_theme.dart`                                          | Added `chipTheme` with explicit label style, background, border, shape                                                                                                                                                                                             |
| `lib/core/theme/app_colors.dart`                                         | No change (used by glass nav)                                                                                                                                                                                                                                      |
| `lib/core/player/unified_video_player_screen.dart`                       | Added `subtitles` param; load `SubtitleTrack.uri()` tracks after `player.open()`; extended bottom sheet with track picker (Off + available tracks); renamed local vars                                                                                             |
| `lib/core/player/playback_source.dart`                                   | No change                                                                                                                                                                                                                                                          |
| `lib/core/router/app_back_button.dart`                                   | **New** — reusable `AppBackButton` widget with `canPop`/`pop`/`go('/')` logic                                                                                                                                                                                      |
| `lib/core/router/app_shell.dart`                                         | Removed Downloads tab from routes/destinations; replaced `NavigationBar` with floating pill `_GlassBottomNav` using `AppColors` palette, `BackdropFilter` blur, `ClipRRect` rounded corners; kept `NavigationRail` for wide layout                                 |
| `lib/core/router/app_router.dart`                                        | No change — `/downloads` route stays as push target                                                                                                                                                                                                                |
| `lib/features/content/shared/presentation/content_detail_scaffold.dart`  | **New** — shared `CustomScrollView` + `SliverAppBar` + poster + title + metadata + genres + description + action/extra/episode sections                                                                                                                            |
| `lib/features/content/shared/presentation/episode_tile.dart`             | **New** — shared `EpisodeTile` widget replacing private `_EpisodeTile` in both anime and TV detail screens                                                                                                                                                         |
| `lib/features/content/anime/presentation/anime_detail_screen.dart`       | Refactored to use `ContentDetailScaffold` + `EpisodeTile`; replaced `SizedBox.shrink()` error state with `Text` + `Retry` button; added `AppBackButton` leading; piped `AnimeWatchSubtitle` list to player; removed unused imports and inline `_EpisodeTile` class |
| `lib/features/content/tv_shows/presentation/tv_show_detail_screen.dart`  | Refactored to use `ContentDetailScaffold` + `EpisodeTile`; extracted `TvSeasonEpisodesSection` widget; added `AppBackButton` leading; removed unused imports                                                                                                       |
| `lib/features/content/movies/presentation/movie_detail_screen.dart`      | Refactored to use `ContentDetailScaffold`; extracted `_MovieActionButtons` widget; added `AppBackButton` leading; removed unused `_formatDuration` and `screenHeight`                                                                                              |
| `lib/features/home/presentation/hero_banner.dart`                        | Replaced `Image.network` → `CachedNetworkImage` (2 instances)                                                                                                                                                                                                      |
| `lib/features/home/presentation/home_screen.dart`                        | Added `leading: person_outline` → `context.push('/profile')` and `actions: download_outlined` → `context.push('/downloads')` to AppBar                                                                                                                             |
| `lib/features/content/shared/presentation/poster_card.dart`              | Replaced `Image.network` → `CachedNetworkImage`                                                                                                                                                                                                                    |
| `lib/features/search/presentation/search_screen.dart`                    | Replaced `Image.network` → `CachedNetworkImage`                                                                                                                                                                                                                    |
| `lib/features/content/shared/presentation/stream_preparing_overlay.dart` | Replaced `Image.network` → `CachedNetworkImage`                                                                                                                                                                                                                    |
| `lib/features/ads/presentation/ad_slot_card.dart`                        | Replaced `Image.network` → `CachedNetworkImage` (2 instances)                                                                                                                                                                                                      |
| `lib/features/downloads/presentation/downloads_screen.dart`              | Replaced `Image.network` → `CachedNetworkImage`                                                                                                                                                                                                                    |
| `lib/features/onboarding/presentation/welcome_screen.dart`               | Replaced `Image.network` → `CachedNetworkImage`; added `AppBackButton` in new `AppBar`                                                                                                                                                                             |
| `lib/features/auth/presentation/profile_screen.dart`                     | Added `AppBackButton` leading to AppBar                                                                                                                                                                                                                            |
| `lib/features/auth/presentation/login_screen.dart`                       | Added `AppBackButton` leading to AppBar                                                                                                                                                                                                                            |
| `lib/features/auth/presentation/signup_screen.dart`                      | Added `AppBackButton` leading to AppBar                                                                                                                                                                                                                            |

---

## Review verdict

**PASS** (with 2 out-of-scope files restored)

### Checks performed

| #   | Check                                                                                                                                                                                         | Result   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | `flutter analyze` — zero issues                                                                                                                                                               | ✅ PASS  |
| 2   | Detail-page nav uses `context.push`, tab-switches use `context.go`                                                                                                                            | ✅ PASS  |
| 3   | `AppBackButton` present on all 7 listed non-tab screens; absent from tab roots                                                                                                                | ✅ PASS  |
| 4   | No `Colors.grey` on detail-screen body text; `chipTheme` uses `colors.text`                                                                                                                   | ✅ PASS  |
| 5   | Anime episode error path surfaces `Text('Failed to load episodes')` + Retry; playback root cause (backend bridge failure) not papered over                                                    | ✅ PASS  |
| 6   | `cached_network_image` in `pubspec.yaml` + `pubspec.lock`; all 17 `Image.network` calls replaced; zero remain                                                                                 | ✅ PASS  |
| 7   | `_GlassBottomNav` replaces `NavigationBar`; `NavigationRail` still used in wide layout; `isTvBuild` preserved for other conditionals; Downloads removed from nav as intended                  | ✅ PASS  |
| 8   | Nothing outside `apps/mobile` was modified (restored `apps/api/test-manga.ts` and `apps/web/src/app/features/anime/pages/anime-watch/anime-watch.component.ts` which were improperly touched) | ✅ FIXED |

### Final `flutter analyze` output

```
Analyzing mobile...
No issues found! (ran in 3.5s)
```
