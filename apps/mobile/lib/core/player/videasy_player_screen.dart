import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'embed_playback_resolver.dart' show EmbedServer;
import 'embed_stream_extractor.dart'
    show
        adBlockerRules,
        blockedAdResourceResponse,
        desktopUserAgent,
        dynamicAdGuardJs,
        embedOrigin,
        evaluateNavigationTarget,
        isAdOrTrackerUrl,
        isBlockedEmbedDocumentRequest,
        isLikelySubtitleUrl,
        subtitleLabelFor,
        wrapperHtmlFor,
        mediaSnifferJs,
        isLikelyMediaStreamUrl;
import 'embed_webview_screen.dart';
import 'playback_source.dart';
import 'unified_video_player_screen.dart';
import '../../features/content/anime/data/anime_models.dart';

/// Handles a Videasy hosted-player URL WITHOUT ever showing Videasy's own
/// (ad-laden, effectively unwatchable) UI. It loads the page hidden behind an
/// opaque overlay and applies the "BrowseHere" stream-sniffing technique used
/// for other providers — hooking fetch/XHR/media `src` and intercepting network
/// requests — to catch the underlying HLS/MP4 stream, then hands that direct URL
/// to the native [UnifiedVideoPlayerScreen] for ad-free playback.
///
/// If no stream can be sniffed within [_sniffTimeout] (or the user opts out),
/// it switches to the [alternates] providers in an ad-blocked
/// [EmbedWebViewScreen] rather than falling back to the Videasy iframe.
class VideasyPlayerScreen extends ConsumerStatefulWidget {
  final String videasyUrl;
  final String title;
  final ProgressTarget? progressTarget;
  final AnimeSkipTimes? skipTimes;
  final List<AnimeWatchSubtitle>? subtitles;

  /// Non-Videasy providers to switch to if the Videasy stream can't be sniffed.
  final List<EmbedServer> alternates;

  /// Shown on the next-episode control. Null for a title with no next episode.
  final String? nextEpisodeLabel;

  /// Advancing to the next episode, forwarded to whichever player this screen
  /// ends up handing off to.
  final VoidCallback? onNextEpisode;

  const VideasyPlayerScreen({
    super.key,
    required this.videasyUrl,
    required this.title,
    this.progressTarget,
    this.skipTimes,
    this.subtitles,
    this.alternates = const [],
    this.nextEpisodeLabel,
    this.onNextEpisode,
  });

  @override
  ConsumerState<VideasyPlayerScreen> createState() =>
      _VideasyPlayerScreenState();
}

/// Programmatically dismisses ad overlays and clicks the play button so the
/// underlying player begins loading its stream while hidden behind our overlay
/// (many players defer the stream request until a user gesture).
const String _videasyPlayKickJs = r'''
(function() {
  if (window.__vsPlayKick) return;
  window.__vsPlayKick = true;
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (attempts > 40) { clearInterval(interval); return; }
    try {
      const selectors = [
        '.jw-icon-display', '.jw-icon-play', '.vjs-big-play-button',
        '.play', '#player', 'button[aria-label="Play"]',
        '.plyr__control--overlaid', '[class*="play"]'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { try { el.click(); } catch (e) {} }
      }
      document.querySelectorAll('video').forEach(v => {
        v.muted = true; v.play().catch(()=>{});
      });
    } catch(e) {}
  }, 400);
})();
''';

class _VideasyPlayerScreenState extends ConsumerState<VideasyPlayerScreen> {
  static const Duration _sniffTimeout = Duration(seconds: 15);

  Timer? _timeoutTimer;
  bool _handled = false;
  String _status = 'Preparing ad-free playback…';

  late final String _referer;

  InAppWebViewController? _webViewController;

  /// Subtitle tracks seen going past while sniffing. The sniffed stream URL
  /// carries none of its own, so these are all the native player will get
  /// whenever the bridge providers didn't supply any.
  final Map<String, AnimeWatchSubtitle> _sniffedSubtitles = {};

  List<AnimeWatchSubtitle>? get _effectiveSubtitles {
    final provided = widget.subtitles;
    if (provided != null && provided.isNotEmpty) return provided;
    if (_sniffedSubtitles.isEmpty) return provided;
    return _sniffedSubtitles.values.toList();
  }

  @override
  void initState() {
    super.initState();
    final uri = Uri.tryParse(widget.videasyUrl);
    _referer = uri != null
        ? '${uri.scheme}://${uri.host}/'
        : 'https://player.videasy.net/';
    _timeoutTimer = Timer(_sniffTimeout, _switchToAlternates);
  }

  void _onMediaCandidate(String url) {
    if (_handled || !mounted) return;
    if (!isLikelyMediaStreamUrl(url)) return;
    _handled = true;
    _timeoutTimer?.cancel();
    // pushReplacement tears this route down, but Android keeps a detached
    // WebView's media running until collection — without this the sniffing
    // page keeps playing underneath the native player.
    unawaited(_teardownWebView());
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => UnifiedVideoPlayerScreen(
          source: DirectPlaybackSource(
            url,
            headers: {
              'Referer': _referer,
              'Origin': _referer.replaceAll(RegExp(r'/$'), ''),
              'User-Agent': desktopUserAgent,
            },
          ),
          title: widget.title,
          progressTarget: widget.progressTarget,
          skipTimes: widget.skipTimes,
          subtitles: _effectiveSubtitles,
          nextEpisodeLabel: widget.nextEpisodeLabel,
          onNextEpisode: widget.onNextEpisode,
        ),
      ),
    );
  }

  Future<void> _teardownWebView() async {
    final controller = _webViewController;
    _webViewController = null;
    if (controller == null) return;
    try {
      await controller.stopLoading();
      await controller.loadData(data: '<html><body></body></html>');
      await controller.pause();
    } catch (_) {
      // Best effort: the platform view may already be gone.
    }
  }

  void _switchToAlternates() {
    if (_handled || !mounted) return;
    _handled = true;
    _timeoutTimer?.cancel();
    unawaited(_teardownWebView());

    if (widget.alternates.isEmpty) {
      setState(() => _status = 'No watchable source found.');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No watchable source found.')),
      );
      Navigator.of(context).pop();
      return;
    }

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => EmbedWebViewScreen(
          sources: widget.alternates
              .map((s) => EmbedSource(url: s.url, label: s.label))
              .toList(),
          title: widget.title,
          subtitles: _effectiveSubtitles,
          progressTarget: widget.progressTarget,
          nextEpisodeLabel: widget.nextEpisodeLabel,
          onNextEpisode: widget.onNextEpisode,
        ),
      ),
    );
  }

  @override
  void dispose() {
    _timeoutTimer?.cancel();
    unawaited(_teardownWebView());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Text(widget.title),
        actions: [
          if (widget.onNextEpisode != null)
            IconButton(
              icon: const Icon(Icons.skip_next),
              tooltip: widget.nextEpisodeLabel ?? 'Next episode',
              onPressed: widget.onNextEpisode,
            ),
        ],
      ),
      body: Stack(
        children: [
          // Hidden sniffing WebView (behind the overlay).
          InAppWebView(
            initialData: InAppWebViewInitialData(
              data: wrapperHtmlFor(widget.videasyUrl),
              baseUrl: WebUri(embedOrigin),
            ),
            initialSettings: InAppWebViewSettings(
              javaScriptEnabled: true,
              useShouldInterceptRequest: true,
              useShouldOverrideUrlLoading: true,
              mediaPlaybackRequiresUserGesture: false,
              userAgent: desktopUserAgent,
              mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
              thirdPartyCookiesEnabled: true,
              supportMultipleWindows: false,
              javaScriptCanOpenWindowsAutomatically: false,
              contentBlockers: adBlockerRules,
            ),
            initialUserScripts: UnmodifiableListView<UserScript>([
              UserScript(
                source: dynamicAdGuardJs,
                injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
                forMainFrameOnly: false,
              ),
              UserScript(
                source: mediaSnifferJs,
                injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
                forMainFrameOnly: false,
              ),
              UserScript(
                source: _videasyPlayKickJs,
                injectionTime: UserScriptInjectionTime.AT_DOCUMENT_END,
                forMainFrameOnly: false,
              ),
            ]),
            onWebViewCreated: (controller) {
              _webViewController = controller;
              controller.addJavaScriptHandler(
                handlerName: 'nsMedia',
                callback: (args) {
                  if (args.isNotEmpty && args.first is String) {
                    _onMediaCandidate(args.first as String);
                  }
                },
              );
              controller.addJavaScriptHandler(
                handlerName: 'nsSubtitle',
                callback: (args) {
                  if (args.isEmpty || args.first is! String) return;
                  final url = args.first as String;
                  if (!isLikelySubtitleUrl(url)) return;
                  _sniffedSubtitles.putIfAbsent(
                    url,
                    () => AnimeWatchSubtitle(
                      url: url,
                      lang: subtitleLabelFor(url),
                    ),
                  );
                },
              );
            },
            shouldOverrideUrlLoading: (controller, navigationAction) async {
              // Videasy (and its ad partners) is the most aggressive of the
              // embed providers about hijacking taps into ad/redirect pages
              // while this WebView sits hidden behind the loading overlay —
              // block anything that isn't the actual video page navigating
              // itself.
              final url = navigationAction.request.url?.toString();
              if (url == null) return NavigationActionPolicy.ALLOW;
              return evaluateNavigationTarget(url, embedUrl: widget.videasyUrl);
            },
            onCreateWindow: (controller, createWindowAction) async {
              return false;
            },
            shouldInterceptRequest: (controller, request) async {
              final url = request.url.toString();
              if (isAdOrTrackerUrl(url)) return blockedAdResourceResponse();
              if (isBlockedEmbedDocumentRequest(
                url,
                isForMainFrame: request.isForMainFrame == true,
              )) {
                return blockedAdResourceResponse();
              }
              if (isLikelyMediaStreamUrl(url)) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  _onMediaCandidate(url);
                });
              }
              return null;
            },
          ),
          Positioned.fill(
            child: ColoredBox(
              color: Colors.black,
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(color: Colors.white),
                    const SizedBox(height: 20),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 32),
                      child: Text(
                        _status,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 14,
                        ),
                      ),
                    ),
                    if (widget.alternates.isNotEmpty) ...[
                      const SizedBox(height: 24),
                      TextButton(
                        onPressed: _switchToAlternates,
                        child: const Text(
                          'Use another server',
                          style: TextStyle(color: Colors.white54),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
