import 'package:dio/dio.dart';

class ContinueWatchingItem {
  final String id;
  final String title;
  final String? imageUrl;
  final double progressFraction;
  final DateTime updatedAt;
  final String contentType;
  final String? slug;
  final String? anilistId;
  final String status;

  ContinueWatchingItem({
    required this.id,
    required this.title,
    this.imageUrl,
    required this.progressFraction,
    required this.updatedAt,
    required this.contentType,
    this.slug,
    this.anilistId,
    required this.status,
  });
}

Future<List<ContinueWatchingItem>> fetchMovieHistory(Dio dio) async {
  try {
    final response = await dio.get('/api/v1/watch/history', queryParameters: {
      'page': 1,
      'limit': 20,
    });
    final body = response.data as Map<String, dynamic>;
    if (body['status'] != 'success') return [];
    final data = body['data'] as List<dynamic>?;
    if (data == null || data.isEmpty) return [];
    return data.map((row) {
      final r = row as Map<String, dynamic>;
      final movie = r['movie'] as Map<String, dynamic>?;
      final progress = (r['progress'] as num?)?.toDouble() ?? 0;
      final duration = (r['duration'] as num?)?.toDouble() ?? 0;
      return ContinueWatchingItem(
        id: r['movieId']?.toString() ?? '',
        title: movie?['title'] as String? ?? '',
        imageUrl: movie?['posterUrl'] as String? ??
            movie?['thumbnailUrl'] as String?,
        progressFraction: duration > 0
            ? (progress / duration).clamp(0.0, 1.0)
            : 0.0,
        updatedAt: DateTime.tryParse(r['updatedAt'] as String? ?? '') ??
            DateTime(2000),
        contentType: 'movie',
        slug: movie?['slug'] as String? ?? movie?['id']?.toString(),
        status: r['status'] as String? ?? 'WATCHING',
      );
    }).toList();
  } catch (_) {
    return [];
  }
}

Future<List<ContinueWatchingItem>> fetchTvHistory(Dio dio) async {
  try {
    final response = await dio.get('/api/v1/tv-shows/history',
        queryParameters: {'limit': 20});
    final body = response.data as Map<String, dynamic>;
    if (body['success'] != true) return [];
    final data = body['data'] as List<dynamic>?;
    if (data == null || data.isEmpty) return [];
    return data.map((row) {
      final r = row as Map<String, dynamic>;
      final show = r['show'] as Map<String, dynamic>?;
      final progress = (r['progress'] as num?)?.toDouble() ?? 0;
      final duration = (r['duration'] as num?)?.toDouble() ?? 0;
      final showId = r['showId']?.toString() ?? '';
      final episodeId = r['episodeId']?.toString() ?? '';
      return ContinueWatchingItem(
        id: 'tv:$showId:$episodeId',
        title: show?['title'] as String? ?? '',
        imageUrl: show?['posterUrl'] as String? ??
            show?['thumbnailUrl'] as String?,
        progressFraction: duration > 0
            ? (progress / duration).clamp(0.0, 1.0)
            : 0.0,
        updatedAt: DateTime.tryParse(r['updatedAt'] as String? ?? '') ??
            DateTime(2000),
        contentType: 'tv',
        slug: show?['slug'] as String? ?? showId,
        status: r['status'] as String? ?? 'WATCHING',
      );
    }).toList();
  } catch (_) {
    return [];
  }
}

Future<List<ContinueWatchingItem>> fetchAnimeHistory(Dio dio) async {
  try {
    final response = await dio.get('/api/v1/anime/history',
        queryParameters: {'limit': 20});
    final body = response.data as Map<String, dynamic>;
    if (body['success'] != true) return [];
    final data = body['data'] as List<dynamic>?;
    if (data == null || data.isEmpty) return [];
    return data.map((row) {
      final r = row as Map<String, dynamic>;
      final anilistId = r['anilistId']?.toString() ?? '';
      final episodeNumber = r['episodeNumber']?.toString() ?? '';
      final progress = (r['progress'] as num?)?.toDouble() ?? 0;
      final duration = (r['duration'] as num?)?.toDouble() ?? 0;
      return ContinueWatchingItem(
        id: 'anime:$anilistId:$episodeNumber',
        title: r['title'] as String? ?? '',
        imageUrl: r['imageUrl'] as String?,
        progressFraction: duration > 0
            ? (progress / duration).clamp(0.0, 1.0)
            : 0.0,
        updatedAt: DateTime.tryParse(r['updatedAt'] as String? ?? '') ??
            DateTime(2000),
        contentType: 'anime',
        anilistId: anilistId,
        status: r['status'] as String? ?? 'WATCHING',
      );
    }).toList();
  } catch (_) {
    return [];
  }
}
