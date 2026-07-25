import 'local_progress_cache.dart';
import 'playback_source.dart';
import 'watch_progress_api.dart';

/// The local-cache key a [ProgressTarget] is stored under.
///
/// Shared rather than derived per-player on purpose: the native player and
/// the WebView fallback record progress for the same episode, so if their key
/// formats ever drifted apart the two would silently keep separate resume
/// points for one title.
String? progressContentKey(ProgressTarget target) {
  if (target is MovieProgressTarget) return 'movie:${target.movieId}';
  if (target is AnimeProgressTarget) {
    return 'anime:${target.anilistId}:${target.episodeNumber}';
  }
  if (target is TvProgressTarget) {
    return 'tv:${target.showId}:${target.episodeId}'
        ':${target.seasonNumber}:${target.episodeNumber}';
  }
  return null;
}

/// Writes [positionSeconds] to the offline cache, then tries to sync it. A
/// successful sync clears the local copy; a failed one leaves it for
/// [LocalProgressCache] to flush later.
Future<void> recordProgress({
  required WatchProgressApi api,
  required ProgressTarget target,
  required int positionSeconds,
  required int durationSeconds,
}) async {
  if (durationSeconds <= 0 || positionSeconds < 0) return;
  final contentKey = progressContentKey(target);
  if (contentKey == null) return;

  try {
    final cache = await LocalProgressCache.getInstance();
    await cache.writeLocal(contentKey, positionSeconds, durationSeconds);
  } catch (_) {}

  try {
    var success = false;
    if (target is MovieProgressTarget) {
      success = await api.saveMovieProgress(
        target.movieId,
        positionSeconds,
        durationSeconds,
      );
    } else if (target is AnimeProgressTarget) {
      success = await api.saveAnimeProgress(
        anilistId: target.anilistId,
        episodeNumber: target.episodeNumber,
        title: target.title,
        imageUrl: target.imageUrl,
        progressSeconds: positionSeconds,
        durationSeconds: durationSeconds,
      );
    } else if (target is TvProgressTarget) {
      success = await api.saveTvProgress(
        showId: target.showId,
        episodeId: target.episodeId,
        seasonNumber: target.seasonNumber,
        episodeNumber: target.episodeNumber,
        progressSeconds: positionSeconds,
        durationSeconds: durationSeconds,
      );
    }
    if (!success) return;
    final cache = await LocalProgressCache.getInstance();
    await cache.clearLocal(contentKey);
  } catch (_) {}
}

/// The saved resume position for [target], in seconds, or null if there
/// isn't a useful one. Anything effectively finished returns null so a
/// rewatch starts from the beginning rather than the credits.
Future<int?> resumePositionSeconds({
  required WatchProgressApi api,
  required ProgressTarget target,
}) async {
  try {
    int progress = 0;
    int duration = 0;

    if (target is MovieProgressTarget) {
      final result = await api.getMovieProgress(target.movieId);
      if (result == null) return null;
      progress = result.progress;
      duration = result.duration;
    } else if (target is AnimeProgressTarget) {
      final result = await api.getAnimeEpisodeProgress(
        target.anilistId,
        target.episodeNumber,
      );
      if (result == null) return null;
      progress = result.progress;
      duration = result.duration;
    } else if (target is TvProgressTarget) {
      final byEpisode = await api.getTvProgress(target.showId);
      final result = byEpisode[target.episodeId];
      if (result == null) return null;
      progress = result.progress;
      duration = result.duration;
    } else {
      return null;
    }

    if (progress < 10) return null;
    if (duration > 0 && progress >= duration * 0.98) return null;
    return progress;
  } catch (_) {
    return null;
  }
}
