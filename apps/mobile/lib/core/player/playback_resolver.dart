import '../../features/content/movies/data/movie_models.dart';
import '../../features/content/anime/data/anime_models.dart';
import 'playback_source.dart';

PlaybackSource resolveMoviePlayback(Movie movie) {
  if (movie.youtubeId != null) {
    return YoutubePlaybackSource(movie.youtubeId!);
  }

  final urls = movie.fileUrls;
  if (urls.isEmpty) {
    return UnresolvedPlaybackSource(
      'This title has no direct playback source yet.',
    );
  }

  String bestUrl = urls.values.firstWhere(
    (v) => _urlPath(v).endsWith('.m3u8'),
    orElse: () => '',
  );
  if (bestUrl.isNotEmpty) {
    return DirectPlaybackSource(bestUrl);
  }

  const qualityOrder = ['4K', '1080p', '720p', '480p'];
  const streamableExtensions = ['.mp4', '.m3u8', '.mkv', '.webm'];
  for (final key in qualityOrder) {
    final v = urls[key];
    if (v != null && v.isNotEmpty) {
      final path = _urlPath(v);
      if (streamableExtensions.any((ext) => path.endsWith(ext))) {
        return DirectPlaybackSource(v);
      }
    }
  }

  final firstNonEmpty = urls.values.firstWhere(
    (v) => v.isNotEmpty,
    orElse: () => '',
  );
  if (firstNonEmpty.isNotEmpty) {
    return DirectPlaybackSource(firstNonEmpty);
  }

  return UnresolvedPlaybackSource(
    'This title has no direct playback source yet.',
  );
}

PlaybackSource resolveAnimeEpisodePlayback(List<AnimeWatchSource> sources) {
  final nonEmbeds = sources.where((s) => !s.isEmbed).toList();
  if (nonEmbeds.isEmpty) {
    return UnresolvedPlaybackSource(
      "This episode is only available via an embedded player, which isn't supported yet.",
    );
  }

  final m3u8 = nonEmbeds.where((s) => s.isM3U8).toList();
  final chosen = m3u8.isNotEmpty ? m3u8.first : nonEmbeds.first;

  return DirectPlaybackSource(
    chosen.url,
    headers: chosen.referer != null ? {'Referer': chosen.referer!} : null,
  );
}

String _urlPath(String url) {
  final queryIdx = url.indexOf('?');
  return queryIdx >= 0 ? url.substring(0, queryIdx) : url;
}
