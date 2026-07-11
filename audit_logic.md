# Logic Audit — apps/mobile/

## main.dart
- no findings

## lib/core/router/app_router.dart
- [severity: low] app_router.dart:132,139,146 — `state.pathParameters['slug']!` and `state.pathParameters['id']!` crash with null if a navigation somehow reaches these routes without the parameter (e.g. manual URL typing in a web context that gets ported to mobile).

## lib/core/network/api_client.dart
- [severity: high] api_client.dart:22-31 — `AuthInterceptor.onRequest` is `async void` but the Dio interceptor pipeline has no Future to await, so the Authorization header is set asynchronously after the request may have already been sent without it; call `handler.next()` only after the token is resolved, or make the read synchronous.
- [severity: low] api_client.dart:81-84 — Empty `catch (_)` after refresh failure silently swallows the original error details, making debugging hard; re-throw or log before emitting `unauthenticated`.

## lib/core/network/base_api.dart
- no findings

## lib/core/network/api_config.dart
- no findings

## lib/core/downloads/download_manager.dart
- [severity: high] download_manager.dart:86-111 — Concurrent `readRecord` + `_writeRecord` (read-modify-write) in `_initUpdatesListener` can lose status updates: a `TaskStatusUpdate` (complete) can be overwritten by a racing `TaskProgressUpdate` because neither is atomic; use a lock or serialize writes per taskId.
- [severity: medium] download_manager.dart:142-157 — `getRecord` throws on malformed JSON but callers like `listDownloads` do not catch per-record errors, so a single corrupted `SharedPreferences` entry aborts the entire download list; wrap each `getRecord` call in a try-catch.
- [severity: low] download_manager.dart:203 — Empty `catch (_)` in `removeDownload` silently swallows file-deletion failures; at least log the error.

## lib/core/player/embed_playback_resolver.dart
- [severity: medium] embed_playback_resolver.dart:51-52 — `(serverResult as dynamic).streamUrl` uses dynamic to bypass type checking on a `TvExtractedStream?` that has already been null-checked; refactor to direct `.streamUrl` access which is safe after the null guard.
- [severity: low] embed_playback_resolver.dart:62-66 — `Future.wait` listens to futures that already have `.then()` handlers attached; while harmless, it makes the control flow harder to reason about — consider a Promise.race-style helper instead.

## lib/core/player/embed_stream_extractor.dart
- [severity: medium] embed_stream_extractor.dart:240 — No try-catch around `await headlessWebView.run()`; if it throws, `headlessWebView` is never disposed (resource leak) and `completer` is never completed (caller hangs); wrap in try/finally with `.dispose()`.
- [severity: low] embed_stream_extractor.dart:169-238 — Exceptions thrown inside `shouldInterceptRequest` or `onLoadStop` callbacks are unhandled and become uncaught errors; wrap callback bodies in try-catch.

## lib/core/player/watch_progress_api.dart
- [severity: high] watch_progress_api.dart:48,174 — `(progress as num) <= 0` casts the raw JSON value to `num`; if the API returns a string (e.g. `"120"`), this throws a `CastError` that crashes the caller; use `(json['progress'] as num?)?.toInt() ?? 0` instead.
- [severity: medium] watch_progress_api.dart:99 — `entry['episodeNumber'] == episodeNumber` uses dynamic equality; if the API sends episodeNumber as a String, the comparison silently fails (no match returned); cast both sides to `int` before comparing.

## lib/core/player/unified_video_player_screen.dart
- [severity: high] unified_video_player_screen.dart:339-340 — TV progress flushed from the local cache via `_flushPendingProgress` uses hardcoded `seasonNumber: 0, episodeNumber: 0` because the cache key `tv:{showId}:{episodeId}` does not encode season/episode; store season+episode in the local cache or use a structured key format.
- [severity: medium] unified_video_player_screen.dart:254-255 — `_writeLocalProgress` and `_syncProgressToServer` are both fire-and-forget from `_saveProgress`; async errors are silently lost; await them or attach `.catchError`.
- [severity: medium] unified_video_player_screen.dart:411,449 — `context.findRenderObject() as RenderBox` crashes if the widget is unmounted while a gesture is in progress (e.g. fast navigation away); guard with `if (!mounted) return` before accessing renderObject.
- [severity: medium] unified_video_player_screen.dart:122-131 — `player.setSubtitleTrack()` is called N times in a loop, each call overwrites the previous selection instead of adding multiple subtitle tracks; the final `setSubtitleTrack(SubtitleTrack.auto())` makes the loop a no-op; pass subtitles via `Media` constructor or use `setSubtitleTrack` only for selection after adding via the media-kit subtitle API.

## lib/features/auth/application/auth_controller.dart
- [severity: maybe] auth_controller.dart:79-82 — `signup` calls `login` on success; if `login` throws (network error), the user is signed up but not logged in; UI should handle this gracefully or link signup to an explicit login step.

## lib/features/auth/data/auth_api.dart
- [severity: low] auth_api.dart:69-76 — Empty `catch (_)` on logout silently swallows server errors; acceptable since logout is best-effort, but consider logging.

## lib/features/auth/data/token_storage.dart
- no findings

## lib/features/auth/data/user_model.dart
- [severity: low] user_model.dart:24-25 — `json['id'] as String` and `json['email'] as String` throw on null/missing fields; acceptable for required fields but will crash if API response is malformed; consider `as String?` with a fallback.

## lib/features/auth/application/auth_events.dart
- no findings

## lib/features/content/anime/data/anime_api.dart
- [severity: maybe] anime_api.dart:23-29 — `'q': ?q`, `'season': ?season` etc. use the Dart 3 null-aware-element syntax on map VALUES; this is only valid if the Dart SDK supports null-aware map value entries (introduced in Dart 3.x as an extension); if not, these entries silently include null values; replace with `if (q != null) 'q': q` pattern for compatibility.

## lib/features/content/anime/data/anime_models.dart
- no findings

## lib/features/content/movies/data/movies_api.dart
- [severity: maybe] movies_api.dart:22-28 — Same `'q': ?q` / `'year': ?year` null-aware-value pattern as `anime_api.dart`; same concern.

## lib/features/content/movies/data/movie_models.dart
- no findings

## lib/features/content/tv_shows/data/tv_shows_api.dart
- [severity: maybe] tv_shows_api.dart:21-25 — Same `'q': ?q` / `'year': ?year` null-aware-value pattern; same concern.

## lib/features/content/tv_shows/data/tv_show_models.dart
- no findings

## lib/features/downloads/ (application/data files)
- no findings — only `presentation/downloads_screen.dart` exists, no application/data files to audit.
