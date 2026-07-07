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
        DirectPlaybackSource(
          extracted.url,
          headers: {'Referer': extracted.referer ?? provider.url},
        ),
      );
    }
  }

  final serverResult = await api.extractStream(slug, season: season, episode: episode);
  if (serverResult != null && serverResult.streamUrl.isNotEmpty) {
    return ResolvedDirectSource(
      DirectPlaybackSource(
        serverResult.streamUrl,
        headers: serverResult.referer != null
            ? {'Referer': serverResult.referer!}
            : null,
      ),
    );
  }

  return EmbedWebViewFallback(providers.first.url);
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
        DirectPlaybackSource(
          extracted.url,
          headers: {'Referer': extracted.referer ?? url},
        ),
      );
    }
  }

  if (backendExtract != null) {
    final serverResult = await backendExtract();
    if (serverResult != null && serverResult.streamUrl.isNotEmpty) {
      return ResolvedDirectSource(
        DirectPlaybackSource(
          serverResult.streamUrl,
          headers: serverResult.referer != null
              ? {'Referer': serverResult.referer!}
              : null,
        ),
      );
    }
  }

  return EmbedWebViewFallback(providerUrls.first);
}
