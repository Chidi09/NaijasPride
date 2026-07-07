import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_client.dart';
import '../../../../core/network/base_api.dart';
import '../../domain/enums.dart';
import 'tv_show_models.dart';

class TvShowsApi extends BaseApi {
  TvShowsApi(super.dio);

  Future<({List<TvShowSummary> data, Map<String, dynamic> meta})> search({
    String? q,
    List<Genre>? genre,
    int? year,
    String? language,
    String? sortBy,
    int page = 1,
    int limit = 20,
  }) async {
    final params = <String, dynamic>{
      'q': ?q,
      if (genre != null) 'genre': genre.map((g) => g.wireValue).toList(),
      'year': ?year,
      'language': ?language,
      'sortBy': ?sortBy,
      'page': page,
      'limit': limit,
    };
    final body = await get('/api/v1/tv-shows', queryParameters: params);
    final data = (body['data'] as List<dynamic>?)
            ?.map((e) => TvShowSummary.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    final meta = body['meta'] as Map<String, dynamic>? ?? {};
    return (data: data, meta: meta);
  }

  Future<TvShow> detail(String slug) async {
    final body = await get('/api/v1/tv-shows/$slug');
    final data = body['data'] as Map<String, dynamic>;
    return TvShow.fromJson(data);
  }

  Future<List<TvEmbedProvider>> embeds(
    String slug, {
    required int season,
    required int episode,
  }) async {
    final body = await get('/api/v1/tv-shows/$slug/embeds', queryParameters: {
      'season': season,
      'episode': episode,
    });
    final data = body['data'] as Map<String, dynamic>?;
    final providers = data?['providers'] as List<dynamic>?;
    return providers
            ?.map((e) => TvEmbedProvider.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
  }

  Future<TvExtractedStream?> extractStream(
    String slug, {
    required int season,
    required int episode,
  }) async {
    try {
      final body = await get(
        '/api/v1/tv-shows/$slug/extract-stream',
        queryParameters: {'season': season, 'episode': episode},
      );
      final data = body['data'] as Map<String, dynamic>?;
      if (data == null) return null;
      return TvExtractedStream.fromJson(data);
    } catch (_) {
      return null;
    }
  }
}

final tvShowsApiProvider = Provider<TvShowsApi>(
    (ref) => TvShowsApi(ref.watch(dioProvider)));
