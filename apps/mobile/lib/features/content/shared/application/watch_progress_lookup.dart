import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_client.dart';
import '../../../home/data/continue_watching_api.dart';

/// A partially-watched (or just-finished) title's progress, as shown on a
/// poster cover: the fraction for the progress bar, a human label for how
/// much is left ("23m left"), and whether it's been fully watched.
typedef ProgressInfo = ({
  double fraction,
  String? remainingLabel,
  bool watched,
});

String? formatRemaining(int remainingSeconds) {
  if (remainingSeconds <= 0) return null;
  final minutes = (remainingSeconds / 60).round();
  if (minutes < 1) return null;
  if (minutes < 60) return '${minutes}m left';
  final hours = minutes ~/ 60;
  final mins = minutes % 60;
  return mins > 0 ? '${hours}h ${mins}m left' : '${hours}h left';
}

ProgressInfo _toProgressInfo(ContinueWatchingItem item) {
  final watched = item.progressFraction >= 0.95;
  final remaining = item.durationSeconds - item.progressSeconds;
  return (
    fraction: item.progressFraction,
    remainingLabel: watched ? null : formatRemaining(remaining),
    watched: watched,
  );
}

class WatchProgressLookup {
  final Map<String, ProgressInfo> movieByKey;
  final Map<String, ProgressInfo> tvByKey;
  final Map<String, ProgressInfo> animeById;

  WatchProgressLookup({
    required this.movieByKey,
    required this.tvByKey,
    required this.animeById,
  });

  ProgressInfo? movie(String? id, String? slug) {
    if (id != null && movieByKey.containsKey(id)) return movieByKey[id];
    if (slug != null && movieByKey.containsKey(slug)) return movieByKey[slug];
    return null;
  }

  ProgressInfo? tv(String? id, String? slug) {
    if (id != null && tvByKey.containsKey(id)) return tvByKey[id];
    if (slug != null && tvByKey.containsKey(slug)) return tvByKey[slug];
    return null;
  }

  ProgressInfo? anime(String? anilistId) {
    if (anilistId != null) return animeById[anilistId];
    return null;
  }
}

final watchProgressLookupProvider = FutureProvider<WatchProgressLookup>((
  ref,
) async {
  final dio = ref.watch(dioProvider);
  final results = await Future.wait([
    fetchMovieHistory(dio),
    fetchTvHistory(dio),
    fetchAnimeHistory(dio),
  ]);

  final movieByKey = <String, ProgressInfo>{};
  final tvByKey = <String, ProgressInfo>{};
  final animeById = <String, ProgressInfo>{};

  final movieItems = List<ContinueWatchingItem>.from(results[0])
    ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  for (final item in movieItems) {
    if (item.progressFraction > 0.02 && item.progressFraction <= 1.0) {
      movieByKey.putIfAbsent(item.id, () => _toProgressInfo(item));
      if (item.slug != null) {
        movieByKey.putIfAbsent(item.slug!, () => _toProgressInfo(item));
      }
    }
  }

  final tvItems = List<ContinueWatchingItem>.from(results[1])
    ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  for (final item in tvItems) {
    if (item.progressFraction > 0.02 && item.progressFraction <= 1.0) {
      final showId = item.id.split(':').elementAtOrNull(1);
      if (showId != null) {
        tvByKey.putIfAbsent(showId, () => _toProgressInfo(item));
      }
      if (item.slug != null) {
        tvByKey.putIfAbsent(item.slug!, () => _toProgressInfo(item));
      }
    }
  }

  final animeItems = List<ContinueWatchingItem>.from(results[2])
    ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  for (final item in animeItems) {
    if (item.progressFraction > 0.02 &&
        item.progressFraction <= 1.0 &&
        item.anilistId != null) {
      animeById.putIfAbsent(item.anilistId!, () => _toProgressInfo(item));
    }
  }

  return WatchProgressLookup(
    movieByKey: movieByKey,
    tvByKey: tvByKey,
    animeById: animeById,
  );
});
