import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_client.dart';
import '../../../../core/network/base_api.dart';
import '../../domain/enums.dart';
import 'movie_models.dart';

class MoviesApi extends BaseApi {
  MoviesApi(super.dio);

  Future<({List<MovieSummary> data, Map<String, dynamic> meta})> search({
    String? q,
    List<Genre>? genre,
    int? year,
    Quality? quality,
    String? sortBy,
    int page = 1,
    int limit = 20,
  }) async {
    final params = <String, dynamic>{
      'q': ?q,
      if (genre != null) 'genre': genre.map((g) => g.wireValue).toList(),
      'year': ?year,
      if (quality != null) 'quality': quality.wireValue,
      'sortBy': ?sortBy,
      'page': page,
      'limit': limit,
    };
    final body = await get('/api/v1/movies', queryParameters: params);
    final data = (body['data'] as List<dynamic>?)
            ?.map((e) => MovieSummary.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    final meta = body['meta'] as Map<String, dynamic>? ?? {};
    return (data: data, meta: meta);
  }

  Future<Map<String, List<MovieSummary>>> featured() async {
    final body = await get('/api/v1/movies/featured');
    final data = body['data'] as Map<String, dynamic>? ?? {};
    return data.map((key, value) => MapEntry(
          key,
          (value as List<dynamic>?)
                  ?.map(
                      (e) => MovieSummary.fromJson(e as Map<String, dynamic>))
                  .toList() ??
              [],
        ));
  }

  Future<Movie> detail(String slug) async {
    final body = await get('/api/v1/movies/$slug');
    final data = body['data'] as Map<String, dynamic>;
    return Movie.fromJson(data);
  }

  Future<List<MovieEmbedProvider>> embeds(String slug) async {
    final body = await get('/api/v1/movies/$slug/embeds');
    final data = body['data'] as Map<String, dynamic>?;
    final providers = data?['providers'] as List<dynamic>?;
    return providers
            ?.map((e) => MovieEmbedProvider.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
  }

  Future<({String streamUrl, String kind, String? referer})?> extractStream(
    String slug,
  ) async {
    try {
      final body = await get('/api/v1/movies/$slug/extract-stream');
      final data = body['data'] as Map<String, dynamic>?;
      if (data == null) return null;
      return (
        streamUrl: data['streamUrl'] as String? ?? '',
        kind: data['kind'] as String? ?? 'other',
        referer: data['referer'] as String?,
      );
    } catch (_) {
      return null;
    }
  }

  Future<List<MovieSummary>> similar(String slug) async {
    final body = await get('/api/v1/movies/$slug/similar');
    final data = (body['data'] as List<dynamic>?)
            ?.map((e) => MovieSummary.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    return data;
  }

  Future<bool> saveOffline(String movieId, String quality, int? fileSizeBytes) async {
    try {
      await post('/api/v1/movies/offline', data: {
        'movieId': movieId,
        'quality': quality,
        // ignore: use_null_aware_elements
        if (fileSizeBytes != null) 'fileSizeBytes': fileSizeBytes,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> removeOffline(String movieId) async {
    try {
      await delete('/api/v1/movies/offline/$movieId');
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<List<OfflineMovieRecord>> listOffline() async {
    try {
      final body = await get('/api/v1/movies/offline');
      final data = body['data'] as List<dynamic>?;
      return data
              ?.map((e) => OfflineMovieRecord.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [];
    } catch (_) {
      return [];
    }
  }
}

final moviesApiProvider = Provider<MoviesApi>(
    (ref) => MoviesApi(ref.watch(dioProvider)));
