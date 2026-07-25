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

/// A backend stream-extraction call, normalised across movies/TV/anime.
typedef _BackendExtract =
    Future<({String streamUrl, String? referer})?> Function();

/// Budget for the client-side headless sniff. An embed that is going to
/// yield a manifest at all does so well inside this.
const Duration _clientSniffTimeout = Duration(seconds: 8);

/// Budget for the backend extractor. It has no timeout of its own, so
/// without one imposed here a slow backend could only ever be resolved by
/// the hard deadline below — which is precisely why the WebView fallback
/// (and with it the server switcher) used to take up to half a minute to
/// appear, long after the user had concluded nothing was going to happen.
const Duration _backendExtractTimeout = Duration(seconds: 9);

/// Absolute ceiling. Both legs are individually bounded now, so this only
/// fires if a future never settles at all.
const Duration _resolutionDeadline = Duration(seconds: 12);

bool _isVideasy(String url) => url.contains('videasy.net');

Future<EmbedResolutionResult> _resolveFromServers({
  required List<EmbedServer> servers,
  required _BackendExtract? backendExtract,
}) async {
  if (servers.isEmpty) {
    return EmbedResolutionFailed('No embed providers available');
  }

  final nonVideasy = servers.where((s) => !_isVideasy(s.url)).toList();

  final firstUrl = servers.first.url;
  if (_isVideasy(firstUrl)) {
    return EmbedVideasyFallback(firstUrl, nonVideasy);
  }

  final completer = Completer<EmbedResolutionResult?>();
  void completeWith(EmbedResolutionResult? result) {
    if (!completer.isCompleted) completer.complete(result);
  }

  // Both legs race to produce a directly-playable (native, ad-free) stream,
  // and both are individually bounded so the pair is guaranteed to settle.
  final Future<ExtractedEmbedStream?> clientFuture =
      extractStreamFromEmbed(firstUrl, timeout: _clientSniffTimeout)
          .timeout(
            _clientSniffTimeout + const Duration(seconds: 2),
            onTimeout: () => null,
          )
          .catchError((_) => null);

  final Future<({String streamUrl, String? referer})?> backendFuture =
      (backendExtract == null ? Future.value(null) : backendExtract())
          .timeout(_backendExtractTimeout, onTimeout: () => null)
          .catchError((_) => null);

  unawaited(
    clientFuture.then((clientResult) {
      if (clientResult == null) return;
      completeWith(
        ResolvedDirectSource(
          DirectPlaybackSource(clientResult.url, headers: clientResult.headers),
        ),
      );
    }),
  );

  unawaited(
    backendFuture.then((serverResult) {
      if (serverResult == null || serverResult.streamUrl.isEmpty) return;
      completeWith(
        ResolvedDirectSource(
          DirectPlaybackSource(
            serverResult.streamUrl,
            headers: _buildServerHeaders(serverResult.referer),
          ),
        ),
      );
    }),
  );

  // Both legs came back empty — fall through to the WebView immediately
  // rather than sitting on the deadline.
  unawaited(
    Future.wait<Object?>([
      clientFuture,
      backendFuture,
    ]).then((_) => completeWith(null)).catchError((_) => completeWith(null)),
  );

  final deadline = Timer(_resolutionDeadline, () => completeWith(null));
  final result = await completer.future.whenComplete(deadline.cancel);
  if (result != null) return result;

  // Never surface Videasy's iframe (unwatchable ads) — only non-Videasy
  // providers are offered as switchable, ad-blocked servers.
  return EmbedWebViewFallback(nonVideasy.isNotEmpty ? nonVideasy : servers);
}

Future<EmbedResolutionResult> resolveTvEpisodePlayback({
  required TvShowsApi api,
  required String slug,
  required int season,
  required int episode,
  required List<TvEmbedProvider> providers,
}) {
  return _resolveFromServers(
    servers: providers.map((p) => EmbedServer(p.url, p.name)).toList(),
    backendExtract: () async {
      final result = await api.extractStream(
        slug,
        season: season,
        episode: episode,
      );
      if (result == null) return null;
      return (streamUrl: result.streamUrl, referer: result.referer);
    },
  );
}

Future<EmbedResolutionResult> resolveEmbedOnlyPlayback({
  required List<EmbedServer> servers,
  Future<({String streamUrl, String kind, String? referer})?> Function()?
  backendExtract,
}) {
  return _resolveFromServers(
    servers: servers,
    backendExtract: backendExtract == null
        ? null
        : () async {
            final result = await backendExtract();
            if (result == null) return null;
            return (streamUrl: result.streamUrl, referer: result.referer);
          },
  );
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
