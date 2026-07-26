import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../network/api_client.dart';
import '../../features/content/anime/data/anime_models.dart';

/// External subtitle tracks, for any content type.
///
/// This used to hang off the anime API, which is why it only ever ran for
/// anime: movies and TV shows never asked the server for subtitles at all and
/// were limited to whatever happened to be embedded in the stream or sniffable
/// out of the embed page. Plenty of titles have neither.
class SubtitlesApi {
  final Dio _dio;

  SubtitlesApi(this._dio);

  /// Returns empty rather than throwing. Missing subtitles must never be the
  /// reason a title won't play.
  Future<List<AnimeWatchSubtitle>> search({
    String? imdbId,
    int? tmdbId,
    int? anilistId,
    int? season,
    int? episode,
    String? title,
    int? year,
    String languages = 'en',
  }) async {
    if (imdbId == null &&
        tmdbId == null &&
        anilistId == null &&
        title == null) {
      return const [];
    }
    try {
      final response = await _dio.get(
        '/api/v1/subtitles',
        queryParameters: {
          'imdbId': ?imdbId,
          'tmdbId': ?tmdbId,
          'anilistId': ?anilistId,
          'season': ?season,
          'episode': ?episode,
          'title': ?title,
          'year': ?year,
          'languages': languages,
        },
      );
      final body = response.data as Map<String, dynamic>?;
      final data = body?['data'] as Map<String, dynamic>?;
      final list = data?['subtitles'] as List<dynamic>? ?? const [];
      return list
          .whereType<Map<String, dynamic>>()
          .map(
            (entry) => AnimeWatchSubtitle(
              url: entry['url'] as String?,
              lang:
                  (entry['label'] as String?) ?? (entry['language'] as String?),
            ),
          )
          .where((track) => track.url != null && track.url!.isNotEmpty)
          .toList();
    } catch (_) {
      return const [];
    }
  }
}

/// Turns a track URL into something a media player can open on its own.
///
/// Most providers hand back a directly linkable file. OpenSubtitles does not:
/// its tracks point at this app's own API, which requires a bearer token, and
/// the player fetches subtitle URLs itself with no way to attach one. So those
/// are downloaded here through the authenticated client and handed to the
/// player as a local file instead.
///
/// The downloaded copy is kept, which matters for more than speed: every
/// OpenSubtitles fetch spends part of a small daily quota shared by every user
/// of this server, and re-selecting a track or replaying an episode would
/// otherwise spend it again.
class SubtitleTrackResolver {
  final Dio _dio;
  final Map<String, String> _resolved = {};

  SubtitleTrackResolver(this._dio);

  static String _cacheFileName(String url) {
    final safe = url.replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_');
    final trimmed = safe.length > 96 ? safe.substring(safe.length - 96) : safe;
    return 'sub_${trimmed}_${url.hashCode.toUnsigned(32)}.vtt';
  }

  /// Returns a URL or file path the player can use, or null if a track that
  /// needed downloading could not be fetched.
  Future<String?> resolve(String url) async {
    // Anything absolute is already directly linkable.
    if (!url.startsWith('/')) return url;

    final cached = _resolved[url];
    if (cached != null) return cached;

    try {
      final directory = await getTemporaryDirectory();
      final file = File('${directory.path}/${_cacheFileName(url)}');
      if (await file.exists() && await file.length() > 0) {
        _resolved[url] = file.path;
        return file.path;
      }

      final response = await _dio.get<String>(
        url,
        options: Options(responseType: ResponseType.plain),
      );
      final content = response.data;
      if (content == null || content.isEmpty) return null;

      await file.writeAsString(content, flush: true);
      _resolved[url] = file.path;
      return file.path;
    } catch (_) {
      return null;
    }
  }
}

final subtitlesApiProvider = Provider<SubtitlesApi>((ref) {
  return SubtitlesApi(ref.watch(dioProvider));
});

final subtitleTrackResolverProvider = Provider<SubtitleTrackResolver>((ref) {
  return SubtitleTrackResolver(ref.watch(dioProvider));
});
