import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_client.dart';
import '../../../home/data/continue_watching_api.dart';

class WatchProgressLookup {
  final Map<String, double> movieByKey;
  final Map<String, double> tvByKey;
  final Map<String, double> animeById;

  WatchProgressLookup({
    required this.movieByKey,
    required this.tvByKey,
    required this.animeById,
  });

  double? movie(String? id, String? slug) {
    if (id != null && movieByKey.containsKey(id)) return movieByKey[id];
    if (slug != null && movieByKey.containsKey(slug)) return movieByKey[slug];
    return null;
  }

  double? tv(String? id, String? slug) {
    if (id != null && tvByKey.containsKey(id)) return tvByKey[id];
    if (slug != null && tvByKey.containsKey(slug)) return tvByKey[slug];
    return null;
  }

  double? anime(String? anilistId) {
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

  final movieByKey = <String, double>{};
  final tvByKey = <String, double>{};
  final animeById = <String, double>{};

  final movieItems = List<ContinueWatchingItem>.from(results[0])
    ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  for (final item in movieItems) {
    if (item.progressFraction > 0.02 && item.progressFraction < 0.98) {
      movieByKey.putIfAbsent(item.id, () => item.progressFraction);
      if (item.slug != null) {
        movieByKey.putIfAbsent(item.slug!, () => item.progressFraction);
      }
    }
  }

  final tvItems = List<ContinueWatchingItem>.from(results[1])
    ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  for (final item in tvItems) {
    if (item.progressFraction > 0.02 && item.progressFraction < 0.98) {
      final showId = item.id.split(':').elementAtOrNull(1);
      if (showId != null) {
        tvByKey.putIfAbsent(showId, () => item.progressFraction);
      }
      if (item.slug != null) {
        tvByKey.putIfAbsent(item.slug!, () => item.progressFraction);
      }
    }
  }

  final animeItems = List<ContinueWatchingItem>.from(results[2])
    ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  for (final item in animeItems) {
    if (item.progressFraction > 0.02 &&
        item.progressFraction < 0.98 &&
        item.anilistId != null) {
      animeById.putIfAbsent(item.anilistId!, () => item.progressFraction);
    }
  }

  return WatchProgressLookup(
    movieByKey: movieByKey,
    tvByKey: tvByKey,
    animeById: animeById,
  );
});
