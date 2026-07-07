import 'playback_source.dart';
import 'embed_stream_extractor.dart';
import '../../features/content/tv_shows/data/tv_show_models.dart';
import '../../features/content/tv_shows/data/tv_shows_api.dart';

sealed class EmbedResolutionResult {}

class ResolvedDirectSource extends EmbedResolutionResult {
  final PlaybackSource source;
  ResolvedDirectSource(this.source);
}

class EmbedWebViewFallback extends EmbedResolutionResult {
  final String url;
  EmbedWebViewFallback(this.url);
}

class EmbedResolutionFailed extends EmbedResolutionResult {
  final String reason;
  EmbedResolutionFailed(this.reason);
}

Future<EmbedResolutionResult> resolveTvEpisodePlayback({
  required TvShowsApi api,
  required String slug,
  required int season,
  required int episode,
  required List<TvEmbedProvider> providers,
}) async {
  if (providers.isEmpty) {
    return EmbedResolutionFailed('No embed providers available');
  }

  for (final provider in providers) {
    final extracted = await extractStreamFromEmbed(provider.url);
    if (extracted != null) {
      return ResolvedDirectSource(
        DirectPlaybackSource(extracted.url, headers: extracted.headers),
      );
    }
  }

  final serverResult = await api.extractStream(
    slug,
    season: season,
    episode: episode,
  );
  if (serverResult != null && serverResult.streamUrl.isNotEmpty) {
    return ResolvedDirectSource(
      DirectPlaybackSource(
        serverResult.streamUrl,
        headers: _buildServerHeaders(serverResult.referer),
      ),
    );
  }

  return EmbedWebViewFallback(providers.first.url);
}

Map<String, String>? _buildServerHeaders(String? referer) {
  if (referer == null) return null;
  final origin = _originFromReferer(referer);
  final headers = <String, String>{
    'Referer': referer,
    'User-Agent': desktopUserAgent,
  };
  if (origin != null) headers['Origin'] = origin;
  return headers;
}

String? _originFromReferer(String referer) {
  try {
    final u = Uri.parse(referer);
    return '${u.scheme}://${u.host}${u.hasPort ? ':${u.port}' : ''}';
  } catch (_) {
    return null;
  }
}

Future<EmbedResolutionResult> resolveEmbedOnlyPlayback({
  required List<String> providerUrls,
  Future<({String streamUrl, String kind, String? referer})?> Function()?
  backendExtract,
}) async {
  if (providerUrls.isEmpty) {
    return EmbedResolutionFailed('No embed providers available');
  }

  for (final url in providerUrls) {
    final extracted = await extractStreamFromEmbed(url);
    if (extracted != null) {
      return ResolvedDirectSource(
        DirectPlaybackSource(extracted.url, headers: extracted.headers),
      );
    }
  }

  if (backendExtract != null) {
    final serverResult = await backendExtract();
    if (serverResult != null && serverResult.streamUrl.isNotEmpty) {
      return ResolvedDirectSource(
        DirectPlaybackSource(
          serverResult.streamUrl,
          headers: _buildServerHeaders(serverResult.referer),
        ),
      );
    }
  }

  return EmbedWebViewFallback(providerUrls.first);
}
