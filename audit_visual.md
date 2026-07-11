# Visual Audit Report

## lib/core/theme/

- no findings

## lib/core/router/app_shell.dart

- [high] app_shell.dart:303-326 — `Colors.white` hardcoded for all NavigationRail icons/labels in `_railDestinations()` — invisible on light theme's light surface; use `colors.text` or `colors.accent` from AppColors.
- [maybe] app_shell.dart:73 — Offline banner text "No internet connection" has no maxLines/ellipsis; though unlikely to wrap, a long localized string could overflow.

## lib/features/home/presentation/home_screen.dart

- [high] home_screen.dart:160-163 — ChoiceChip `labelStyle` hardcoded to `Colors.white` / `Colors.white70` with `Colors.white.withAlpha(15)` background — invisible text in light theme; use `theme.colorScheme.onSurface`.
- [high] home_screen.dart:412-413 — Shimmer `baseColor: Colors.grey.shade900` / `highlightColor: Colors.grey.shade800` — dark-grey flicker on light theme looks wrong; derive from theme surface colors.
- [maybe] home_screen.dart:110 — TV build `HeroBanner(movie: heroMovie)` missing second title line maxLines constraint inherited from non-TV version; same overflow risk as hero_banner TV path.

## lib/features/home/presentation/hero_banner.dart

- [maybe] hero_banner.dart:183-193 — TV-build `Text(movie.title)` lacks `maxLines`/`overflow` — a very long movie title could overflow the banner card.
- [maybe] hero_banner.dart:264-265 — Gradient uses `theme.scaffoldBackgroundColor` which is light cream (#F7EFE8) in light theme; white text over cream at the bottom of the gradient may have insufficient contrast.

## lib/features/search/presentation/search_screen.dart

- [high] search_screen.dart:198 — `backgroundColor: const Color(0xFF0A0A0F)` forces a fixed dark background regardless of theme, making the entire search screen appear broken in light mode.
- [high] search_screen.dart:207-214 — Every text, icon, and decoration color hardcoded to `Colors.white` / `Colors.white70` / `Colors.white.withAlpha(N)` — invisible on light theme; use theme colors.
- [high] search_screen.dart:236 — `fillColor: Colors.white.withAlpha(15)` on text field — produces near-white input on white background in light mode; use `theme.colorScheme.surface`.

## lib/features/content/anime/presentation/anime_screen.dart

- no findings

## lib/features/content/anime/presentation/anime_detail_screen.dart

- no findings

## lib/features/content/movies/presentation/movies_screen.dart

- no findings

## lib/features/content/movies/presentation/movie_detail_screen.dart

- [maybe] movie_detail_screen.dart:213 — `CircleAvatar` uses raw `NetworkImage` without `errorBuilder` — a broken cast photo URL renders nothing (empty avatar circle).

## lib/features/content/tv_shows/presentation/tv_shows_screen.dart

- no findings

## lib/features/content/tv_shows/presentation/tv_show_detail_screen.dart

- no findings

## lib/features/content/shared/presentation/content_detail_scaffold.dart

- no findings

## lib/features/content/shared/presentation/content_carousel.dart

- [low] content_carousel.dart:68-70 — Section `title` in `Text` widget has no `maxLines`/`overflow: TextOverflow.ellipsis` — a long section title could overflow the viewport on narrow screens.

## lib/features/content/shared/presentation/poster_card.dart

- no findings

## lib/features/downloads/presentation/downloads_screen.dart

- [high] downloads_screen.dart:48 — Hardcoded `const Color(0xFF0D0D0D)` scaffold background overrides theme, breaking light mode entirely.
- [high] downloads_screen.dart:197-210 — All tile text colors hardcoded to `Colors.white` — invisible on light theme; use `theme.colorScheme.onSurface`.
- [high] downloads_screen.dart:159 — Tile background `Colors.white.withAlpha(10)` — nearly transparent on light scaffold; use `theme.colorScheme.surface`.

## lib/features/auth/presentation/login_screen.dart

- [maybe] login_screen.dart:107 — `extendBodyBehindAppBar: true` with transparent AppBar and no `SafeArea` — status bar icons may overlap scroll content on devices with light status bar text.

## lib/features/auth/presentation/signup_screen.dart

- [maybe] signup_screen.dart:62 — Same `extendBodyBehindAppBar: true` without `SafeArea` as login_screen; status bar may overlap form fields.

## lib/features/auth/presentation/profile_screen.dart

- [high] profile_screen.dart:175,188-206 — Card backgrounds hardcoded to `Colors.white.withAlpha(10)` and segmented button theme overrides with `Colors.white` / `Colors.white.withAlpha(8)` — invisible containers and text in light theme; use `theme.colorScheme.surface`.

## lib/features/onboarding/presentation/welcome_screen.dart

- no findings

## lib/features/ads/presentation/ad_slot_card.dart

- [low] ad_slot_card.dart:97 — `ad.title` in `AdBannerCard` has no `maxLines`/`overflow` — a long ad title could overflow the 16:9 container.

## lib/core/player/unified_video_player_screen.dart

- no findings (video player is dark-only by design; hardcoded dark colors are intentional)
