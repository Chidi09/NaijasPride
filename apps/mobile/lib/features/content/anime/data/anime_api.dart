import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/anilist/anilist_config.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/base_api.dart';
import 'anime_models.dart';

class AnimeApi extends BaseApi {
  AnimeApi(super.dio);

  Future<({List<AnimeSummary> media, Map<String, dynamic> pageInfo})> search({
    String? q,
    String? season,
    int? seasonYear,
    String? format,
    String? status,
    String? genre,
    String? sort,
    int page = 1,
    int perPage = 20,
  }) async {
    final params = <String, dynamic>{
      'q': ?q,
      'season': ?season,
      'seasonYear': ?seasonYear,
      'format': ?format,
      'status': ?status,
      'genre': ?genre,
      'sort': ?sort,
      'page': page,
      'perPage': perPage,
    };
    final body = await get('/api/v1/anime/search', queryParameters: params);
    final data = body['data'] as Map<String, dynamic>? ?? {};
    final pageInfo = data['pageInfo'] as Map<String, dynamic>? ?? {};
    final media = (data['media'] as List<dynamic>?)
            ?.map((e) => AnimeSummary.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    return (media: media, pageInfo: pageInfo);
  }

  Future<AnimeDetail> detail(int id) async {
    final body = await get('/api/v1/anime/$id');
    final data = body['data'] as Map<String, dynamic>;
    return AnimeDetail.fromJson(data);
  }

  Future<List<AnimeEpisode>> episodes(int id) async {
    final body = await get('/api/v1/anime/$id/episodes');
    final data = body['data'] as Map<String, dynamic>? ?? {};
    final episodes = (data['episodes'] as List<dynamic>?)
            ?.map((e) => AnimeEpisode.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    return episodes;
  }

  Future<({String streamUrl, String kind, String? referer})?> extractStream(
    String embedUrl,
  ) async {
    try {
      final body = await get('/api/v1/anime/extract-stream', queryParameters: {
        'url': embedUrl,
      });
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

  Future<int?> linkAniList(String code) async {
    try {
      final body = await post('/api/v1/anime/anilist-link', data: {
        'code': code,
        'redirectUri': anilistRedirectUri,
      });
      final data = body['data'] as Map<String, dynamic>?;
      return (data?['anilistUserId'] as num?)?.toInt();
    } catch (_) {
      return null;
    }
  }

  Future<bool> unlinkAniList() async {
    try {
      await delete('/api/v1/anime/anilist-link');
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<({bool linked, int? anilistUserId})> getAniListLinkStatus() async {
    try {
      final body = await get('/api/v1/anime/anilist-link');
      final data = body['data'] as Map<String, dynamic>?;
      if (data == null) return (linked: false, anilistUserId: null);
      return (
        linked: data['linked'] as bool? ?? false,
        anilistUserId: (data['anilistUserId'] as num?)?.toInt(),
      );
    } catch (_) {
      return (linked: false, anilistUserId: null);
    }
  }

  Future<({List<AnimeWatchSource> sources, List<AnimeWatchSubtitle> subtitles})> watch(
    int id,
    int episodeNumber,
  ) async {
    final body = await get('/api/v1/anime/$id/watch/$episodeNumber');
    final data = body['data'] as Map<String, dynamic>? ?? {};
    final sources = (data['sources'] as List<dynamic>?)
            ?.map(
                (e) => AnimeWatchSource.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    final subtitles = (data['subtitles'] as List<dynamic>?)
            ?.map((e) =>
                AnimeWatchSubtitle.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    return (sources: sources, subtitles: subtitles);
  }

  Future<AnimeSkipTimes> skipTimes(int id, int episodeNumber) async {
    try {
      final body = await get('/api/v1/anime/$id/skip-times/$episodeNumber');
      final data = body['data'] as Map<String, dynamic>?;
      if (data == null) return const AnimeSkipTimes();
      return AnimeSkipTimes.fromJson(data);
    } catch (_) {
      return const AnimeSkipTimes();
    }
  }
}

final animeApiProvider = Provider<AnimeApi>(
    (ref) => AnimeApi(ref.watch(dioProvider)));
