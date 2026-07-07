import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/base_api.dart';

class WatchProgressApi extends BaseApi {
  WatchProgressApi(super.dio);

  // NOTE: apps/api/src/modules/users/watch.routes.ts (movie progress) uses
  // `{status: "success", data}` instead of the `{success: true, data}`
  // envelope every other endpoint in this app uses (confirmed by reading the
  // route handlers directly) — a real backend inconsistency, not something to
  // "fix" here. These two methods talk to `dio` directly instead of via
  // BaseApi.get()/post() (which hard-check `success`) to handle it correctly.

  Future<bool> saveMovieProgress(
    String movieId,
    int progressSeconds,
    int durationSeconds, {
    String? status,
  }) async {
    try {
      await dio.post(
        '/api/v1/watch/progress',
        data: {
          'movieId': movieId,
          'progress': progressSeconds,
          'duration': durationSeconds,
          // ignore: use_null_aware_elements
          if (status != null) 'status': status,
        },
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<({int progress, int duration, String? status})?> getMovieProgress(
    String movieId,
  ) async {
    try {
      final response = await dio.get('/api/v1/watch/progress/$movieId');
      final body = response.data as Map<String, dynamic>;
      if (body['status'] != 'success') return null;
      final data = body['data'] as Map<String, dynamic>?;
      final progress = data?['progress'];
      if (data == null || progress == null || (progress as num) <= 0) {
        return null;
      }
      return (
        progress: progress.toInt(),
        duration: ((data['duration'] as num?) ?? 0).toInt(),
        status: data['status'] as String?,
      );
    } catch (_) {
      return null;
    }
  }

  Future<bool> saveAnimeProgress({
    required int anilistId,
    required int episodeNumber,
    required String title,
    String? imageUrl,
    String? status,
    required int progressSeconds,
    required int durationSeconds,
  }) async {
    try {
      await post(
        '/api/v1/anime/progress',
        data: {
          'anilistId': anilistId,
          'episodeNumber': episodeNumber,
          'title': title,
          // ignore: use_null_aware_elements
          if (imageUrl != null) 'imageUrl': imageUrl,
          'progress': progressSeconds,
          'duration': durationSeconds,
          // ignore: use_null_aware_elements
          if (status != null) 'status': status,
        },
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<({int progress, int duration, String? status})?>
  getAnimeEpisodeProgress(int anilistId, int episodeNumber) async {
    try {
      final body = await get('/api/v1/anime/progress/$anilistId');
      final data = body['data'] as List<dynamic>?;
      if (data == null) return null;
      for (final entry in data) {
        if (entry is Map<String, dynamic> &&
            entry['episodeNumber'] == episodeNumber) {
          return (
            progress: (entry['progress'] as num).toInt(),
            duration: (entry['duration'] as num).toInt(),
            status: entry['status'] as String?,
          );
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<Map<int, ({int progress, int duration, String? status})>>
  getAnimeProgress(int anilistId) async {
    try {
      final body = await get('/api/v1/anime/progress/$anilistId');
      final data = body['data'] as List<dynamic>?;
      if (data == null) return {};
      final map = <int, ({int progress, int duration, String? status})>{};
      for (final entry in data) {
        if (entry is Map<String, dynamic>) {
          final epNum = (entry['episodeNumber'] as num?)?.toInt();
          if (epNum != null) {
            map[epNum] = (
              progress: (entry['progress'] as num?)?.toInt() ?? 0,
              duration: (entry['duration'] as num?)?.toInt() ?? 0,
              status: entry['status'] as String?,
            );
          }
        }
      }
      return map;
    } catch (_) {
      return {};
    }
  }

  Future<bool> saveTvProgress({
    required String showId,
    required String episodeId,
    required int seasonNumber,
    required int episodeNumber,
    required int progressSeconds,
    required int durationSeconds,
    String? status,
  }) async {
    try {
      await post(
        '/api/v1/tv-shows/progress',
        data: {
          'showId': showId,
          'episodeId': episodeId,
          'seasonNumber': seasonNumber,
          'episodeNumber': episodeNumber,
          'progress': progressSeconds,
          'duration': durationSeconds,
          // ignore: use_null_aware_elements
          if (status != null) 'status': status,
        },
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<({int progress, int duration, String? episodeId, String? status})?>
  getTvProgress(String showId) async {
    try {
      final body = await get('/api/v1/tv-shows/progress/$showId');
      final data = body['data'] as Map<String, dynamic>?;
      if (data == null) return null;
      final progress = data['progress'];
      if (progress == null || (progress as num) <= 0) return null;
      return (
        progress: progress.toInt(),
        duration: ((data['duration'] as num?) ?? 0).toInt(),
        episodeId: data['episodeId'] as String?,
        status: data['status'] as String?,
      );
    } catch (_) {
      return null;
    }
  }
}

final watchProgressApiProvider = Provider<WatchProgressApi>(
  (ref) => WatchProgressApi(ref.watch(dioProvider)),
);
