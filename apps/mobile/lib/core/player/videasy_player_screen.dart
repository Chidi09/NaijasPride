import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'embed_playback_resolver.dart' show EmbedServer;
import 'embed_stream_extractor.dart'
    show
        adBlockerRules,
        desktopUserAgent,
        embedOrigin,
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

  /// Non-Videasy providers to switch to if the Videasy stream can't be sniffed.
  final List<EmbedServer> alternates;

  const VideasyPlayerScreen({
    super.key,
    required this.videasyUrl,
    required this.title,
    this.progressTarget,
    this.skipTimes,
    this.alternates = const [],
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
        ),
      ),
    );
  }

  void _switchToAlternates() {
    if (_handled || !mounted) return;
    _handled = true;
    _timeoutTimer?.cancel();

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
        ),
      ),
    );
  }

  @override
  void dispose() {
    _timeoutTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Text(widget.title),
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
              controller.addJavaScriptHandler(
                handlerName: 'nsMedia',
                callback: (args) {
                  if (args.isNotEmpty && args.first is String) {
                    _onMediaCandidate(args.first as String);
                  }
                },
              );
            },
            shouldInterceptRequest: (controller, request) async {
              final url = request.url.toString();
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
