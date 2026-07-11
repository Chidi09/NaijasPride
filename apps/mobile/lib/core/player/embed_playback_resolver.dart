import 'dart:async';
import 'playback_source.dart';
import 'embed_stream_extractor.dart';
import '../../features/content/tv_shows/data/tv_show_models.dart';
import '../../features/content/tv_shows/data/tv_shows_api.dart';

sealed class EmbedResolutionResult {}

/// A single embed provider option (its playable page URL + a human label),
/// used to populate the server-switch menu on the WebView fallback path.
class EmbedServer {
  final String url;
  final String label;
  EmbedServer(this.url, this.label);
}

class ResolvedDirectSource extends EmbedResolutionResult {
  final PlaybackSource source;
  ResolvedDirectSource(this.source);
}

class EmbedWebViewFallback extends EmbedResolutionResult {
  /// All available providers, so the WebView screen can offer server switching.
  final List<EmbedServer> servers;
  EmbedWebViewFallback(this.servers);
}

class EmbedVideasyFallback extends EmbedResolutionResult {
  /// The Videasy hosted-player URL to sniff a direct stream from.
  final String url;

  /// Non-Videasy providers to fall back to (with ad blocking) if the Videasy
  /// stream can't be sniffed — Videasy's own iframe is never surfaced because
  /// its ads make it unwatchable.
  final List<EmbedServer> alternates;
  EmbedVideasyFallback(this.url, this.alternates);
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

  final allServers = providers
      .map((p) => EmbedServer(p.url, p.name))
      .toList();
  final nonVideasy = allServers
      .where((s) => !s.url.contains('videasy.net'))
      .toList();

  final firstUrl = providers.first.url;
  if (firstUrl.contains('videasy.net')) {
    return EmbedVideasyFallback(firstUrl, nonVideasy);
  }

  final clientFuture = extractStreamFromEmbed(
    firstUrl,
    timeout: const Duration(seconds: 8),
  );
  final backendFuture = api.extractStream(
    slug,
    season: season,
    episode: episode,
  );

  final completer = Completer<EmbedResolutionResult?>();

  clientFuture
      .then((clientResult) {
        if (clientResult != null && !completer.isCompleted) {
          completer.complete(
            ResolvedDirectSource(
              DirectPlaybackSource(
                clientResult.url,
                headers: clientResult.headers,
              ),
            ),
          );
        }
      })
      .catchError((_) {});

  backendFuture
      .then((serverResult) {
        if (serverResult != null) {
          final streamUrl = serverResult.streamUrl;
          final referer = serverResult.referer;
          if (streamUrl.isNotEmpty && !completer.isCompleted) {
            completer.complete(
              ResolvedDirectSource(
                DirectPlaybackSource(
                  streamUrl,
                  headers: _buildServerHeaders(referer),
                ),
              ),
            );
          }
        }
      })
      .catchError((_) {});

  // Wait for both to fail, or max 30 seconds
  Future.wait([clientFuture, backendFuture])
      .then((_) {
        if (!completer.isCompleted) completer.complete(null);
      })
      .catchError((_) {
        if (!completer.isCompleted) completer.complete(null);
      });

  Future.delayed(const Duration(seconds: 30), () {
    if (!completer.isCompleted) completer.complete(null);
  });

  final result = await completer.future;
  if (result != null) return result;

  // Never surface Videasy's iframe (unwatchable ads) — only non-Videasy
  // providers are offered as switchable, ad-blocked servers.
  return EmbedWebViewFallback(nonVideasy.isNotEmpty ? nonVideasy : allServers);
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
  required List<EmbedServer> servers,
  Future<({String streamUrl, String kind, String? referer})?> Function()?
  backendExtract,
}) async {
  if (servers.isEmpty) {
    return EmbedResolutionFailed('No embed providers available');
  }

  final nonVideasy = servers
      .where((s) => !s.url.contains('videasy.net'))
      .toList();

  final firstUrl = servers.first.url;
  if (firstUrl.contains('videasy.net')) {
    return EmbedVideasyFallback(firstUrl, nonVideasy);
  }

  final clientFuture = extractStreamFromEmbed(
    firstUrl,
    timeout: const Duration(seconds: 8),
  );
  final backendFuture = backendExtract != null
      ? backendExtract()
      : Future.value(null);

  final completer = Completer<EmbedResolutionResult?>();

  clientFuture
      .then((clientResult) {
        if (clientResult != null && !completer.isCompleted) {
          completer.complete(
            ResolvedDirectSource(
              DirectPlaybackSource(
                clientResult.url,
                headers: clientResult.headers,
              ),
            ),
          );
        }
      })
      .catchError((_) {});

  backendFuture
      .then((serverResult) {
        if (serverResult != null &&
            serverResult.streamUrl.isNotEmpty &&
            !completer.isCompleted) {
          completer.complete(
            ResolvedDirectSource(
              DirectPlaybackSource(
                serverResult.streamUrl,
                headers: _buildServerHeaders(serverResult.referer),
              ),
            ),
          );
        }
      })
      .catchError((_) {});

  Future.wait([clientFuture, backendFuture])
      .then((_) {
        if (!completer.isCompleted) completer.complete(null);
      })
      .catchError((_) {
        if (!completer.isCompleted) completer.complete(null);
      });

  Future.delayed(const Duration(seconds: 30), () {
    if (!completer.isCompleted) completer.complete(null);
  });

  final result = await completer.future;
  if (result != null) return result;

  // Never surface Videasy's iframe (unwatchable ads) — only non-Videasy
  // providers are offered as switchable, ad-blocked servers.
  return EmbedWebViewFallback(nonVideasy.isNotEmpty ? nonVideasy : servers);
}
