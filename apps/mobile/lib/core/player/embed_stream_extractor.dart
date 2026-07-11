import 'dart:async';
import 'dart:collection';

import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class ExtractedEmbedStream {
  final String url;
  final Map<String, String> headers;

  const ExtractedEmbedStream({required this.url, required this.headers});
}

const String desktopUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// naijaspride.com's own web app plays every one of these providers
// (vidking, vidsrc, 2embed, etc.) by dropping the provider URL straight into
// an <iframe src="..."> on the live site - see
// apps/web/src/app/shared/components/embed-player/embed-player.component.ts.
// Navigating a WebView directly (top-level) to the provider URL is a very
// different request context: no parent Referer, and window.top === self,
// which is exactly the shape these providers block/serve blank-player pages
// for. Loading a local wrapper page that iframes the provider URL - with
// baseUrl set to the real production origin, so the iframe's own request
// carries a Referer of https://www.naijaspride.com/, matching the one known
// working configuration - reproduces the site's real embed context instead
// of guessing at a new one.
const String embedOrigin = 'https://www.naijaspride.com/';

String wrapperHtmlFor(String embedUrl) {
  final escaped = embedUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return '''
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#000;overflow:hidden;">
<iframe src="$escaped" allow="autoplay; fullscreen; encrypted-media" allowfullscreen
  style="position:fixed;top:0;left:0;width:100%;height:100%;border:0;"></iframe>
</body>
</html>
''';
}

final RegExp _mediaUrlPattern = RegExp(
  r'\.(m3u8|mpd|mp4|m4s)([?#/]|$)|/manifest\b|/master[./]|/playlist[./]|[?&](type|format)=(m3u8|hls|dash)|mime=video',
  caseSensitive: false,
);

final RegExp _adAssetPattern = RegExp(
  r'(preroll|/ads/|/ad/|vast|midroll)',
  caseSensitive: false,
);

final RegExp _segmentPattern = RegExp(
  r'seg-|segment|\.ts(\?|$)|\.m4s(\?|$)',
  caseSensitive: false,
);

/// True if [url] looks like a real playable manifest/video rather than an
/// ad asset or an individual HLS/DASH segment. Used to filter candidates
/// reported by [mediaSnifferJs] before offering them for playback, since
/// that JS only applies the loose [_mediaUrlPattern] regex on its own.
bool isLikelyMediaStreamUrl(String url) {
  if (_isBlockedHost(url)) return false;
  final path = Uri.tryParse(url)?.path ?? url;
  if (_adAssetPattern.hasMatch(path)) return false;
  if (_segmentPattern.hasMatch(url)) return false;
  return _mediaUrlPattern.hasMatch(url);
}

class _Candidate {
  final String url;
  final Map<String, String> headers;
  final int score;
  _Candidate({required this.url, required this.headers, required this.score});
}

String? _headerValue(Map<String, String>? headers, String key) {
  if (headers == null) return null;
  final lowerKey = key.toLowerCase();
  for (final entry in headers.entries) {
    if (entry.key.toLowerCase() == lowerKey) return entry.value;
  }
  return null;
}

bool _isBlockedHost(String url) {
  try {
    final host = Uri.parse(url).host.toLowerCase();
    const blocked = [
      'doubleclick',
      'googlesyndication',
      'google-analytics',
      'googletagmanager',
      'popads',
      'popcash',
      'propellerads',
      'adnxs',
      'amazon-adsystem',
      'facebook',
      'scorecardresearch',
      '.gif',
      'analytics',
    ];
    return blocked.any((b) => host.contains(b));
  } catch (_) {
    return false;
  }
}

const String _playKickJs = r'''
(function() {
  if (window.__playKickStarted) return;
  window.__playKickStarted = true;
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (attempts > 30) { clearInterval(interval); return; }
    try {
      const selectors = [
        '.jw-icon-display', '.jw-icon-play', '.vjs-big-play-button',
        '.play', '#player', 'button[aria-label="Play"]', '.plyr__control--overlaid'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { el.click(); clearInterval(interval); break; }
      }
      document.querySelectorAll('video').forEach(v => { v.muted = true; v.play().catch(()=>{}); });
    } catch(e) {}
  }, 400);
})();
''';

const String mediaSnifferJs = r'''
(function() {
  if (window.__nsSniff) return;
  window.__nsSniff = true;
  var re = /\.(m3u8|mpd|mp4|m4s)([?#/]|$)|\/manifest\b|\/master[.\/]|\/playlist[.\/]|[?&](type|format)=(m3u8|hls|dash)|mime=video/i;
  function report(u) {
    try {
      if (!u || typeof u !== 'string') return;
      if (u.indexOf('blob:') === 0 || u.indexOf('data:') === 0) return;
      if (u.indexOf('//') === 0) u = location.protocol + u;
      if (u.indexOf('/') === 0) u = location.origin + u;
      if (u.indexOf('http') !== 0) return;
      if (!re.test(u)) return;
      if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
        window.flutter_inappwebview.callHandler('nsMedia', u);
      }
    } catch (e) {}
  }
  try {
    var _f = window.fetch;
    if (_f) window.fetch = function(a, b) {
      try { var u = (typeof a === 'string') ? a : (a && a.url); report(u); } catch (e) {}
      return _f.apply(this, arguments);
    };
  } catch (e) {}
  try {
    var _o = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u) { try { report(u); } catch (e) {} return _o.apply(this, arguments); };
  } catch (e) {}
  function hookSrc(proto) {
    try {
      var d = Object.getOwnPropertyDescriptor(proto, 'src');
      if (!d || !d.set) return;
      Object.defineProperty(proto, 'src', {
        get: d.get,
        set: function(v) { try { report(v); } catch (e) {} return d.set.call(this, v); },
        configurable: true
      });
    } catch (e) {}
  }
  try { hookSrc(HTMLMediaElement.prototype); } catch (e) {}
  try { hookSrc(HTMLSourceElement.prototype); } catch (e) {}
  setInterval(function() {
    try {
      document.querySelectorAll('video, source').forEach(function(el) {
        report(el.currentSrc || el.src);
      });
    } catch (e) {}
  }, 1000);
})();
''';

Future<ExtractedEmbedStream?> extractStreamFromEmbed(
  String embedUrl, {
  Duration timeout = const Duration(seconds: 20),
}) async {
  final completer = Completer<ExtractedEmbedStream?>();
  final candidates = <_Candidate>[];
  HeadlessInAppWebView? headlessWebView;
  Timer? timeoutTimer;
  Timer? settleTimer;
  String lastDocumentUrl = embedUrl;
  bool settled = false;

  void finish() {
    if (settled) return;
    settled = true;
    timeoutTimer?.cancel();
    settleTimer?.cancel();
    if (completer.isCompleted) return;
    if (candidates.isEmpty) {
      completer.complete(null);
    } else {
      final best = candidates.reduce((a, b) => b.score > a.score ? b : a);
      completer.complete(
        ExtractedEmbedStream(url: best.url, headers: best.headers),
      );
    }
  }

  void considerCandidate(String url, Map<String, String> headers) {
    if (settled) return;
    final path = Uri.tryParse(url)?.path ?? url;
    if (_adAssetPattern.hasMatch(path)) return;

    int score = 0;
    if (url.contains('.m3u8')) {
      score += 100;
    } else if (url.contains('.mp4')) {
      score += 50;
    }
    if (url.contains('master')) score += 40;
    if (url.contains('index') || url.contains('playlist')) score += 15;
    if (url.startsWith('https')) score += 10;
    if (_segmentPattern.hasMatch(url)) score -= 60;

    if (score <= 0) return;

    candidates.add(_Candidate(url: url, headers: headers, score: score));

    if (settleTimer == null) {
      final delay = score >= 140
          ? const Duration(milliseconds: 400)
          : const Duration(milliseconds: 2000);
      settleTimer = Timer(delay, finish);
    }
  }

  headlessWebView = HeadlessInAppWebView(
    initialData: InAppWebViewInitialData(
      data: wrapperHtmlFor(embedUrl),
      baseUrl: WebUri(embedOrigin),
    ),
    initialUserScripts: UnmodifiableListView<UserScript>([
      UserScript(
        source: _playKickJs,
        injectionTime: UserScriptInjectionTime.AT_DOCUMENT_END,
        forMainFrameOnly: false,
      ),
      UserScript(
        source: mediaSnifferJs,
        injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
        forMainFrameOnly: false,
      ),
    ]),
    initialSettings: InAppWebViewSettings(
      javaScriptEnabled: true,
      useShouldInterceptRequest: true,
      mediaPlaybackRequiresUserGesture: false,
      userAgent: desktopUserAgent,
      transparentBackground: true,
      mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
      thirdPartyCookiesEnabled: true,
    ),
    onWebViewCreated: (controller) async {
      controller.addJavaScriptHandler(
        handlerName: 'nsMedia',
        callback: (args) {
          if (settled) return;
          if (args.isNotEmpty && args.first is String) {
            final u = args.first as String;
            if (_mediaUrlPattern.hasMatch(u) && !_isBlockedHost(u)) {
              considerCandidate(u, {
                'Referer': lastDocumentUrl,
                'User-Agent': desktopUserAgent,
              });
            }
          }
        },
      );
    },
    shouldInterceptRequest: (controller, request) async {
      if (settled) return null;
      final url = request.url.toString();

      // Track navigable document URLs for referer fallback
      if (!_mediaUrlPattern.hasMatch(url)) {
        final isMainFrame = request.isForMainFrame == true;
        final lastSegment = Uri.tryParse(url)?.pathSegments.lastOrNull ?? '';
        final hasNoExt = !lastSegment.contains('.');
        if (isMainFrame ||
            hasNoExt ||
            lastSegment.endsWith('.html') ||
            lastSegment.endsWith('.php')) {
          lastDocumentUrl = url;
        }
      }

      if (!_mediaUrlPattern.hasMatch(url) || _isBlockedHost(url)) {
        return null;
      }

      // Build headers from intercepted request
      final reqHeaders = request.headers ?? {};
      final referer = _headerValue(reqHeaders, 'referer') ?? lastDocumentUrl;
      String? origin = _headerValue(reqHeaders, 'origin');
      if (origin == null) {
        try {
          final u = Uri.parse(referer);
          origin = '${u.scheme}://${u.host}${u.hasPort ? ':${u.port}' : ''}';
        } catch (_) {}
      }
      final headers = <String, String>{
        'Referer': referer,
        'User-Agent': desktopUserAgent,
      };
      if (origin != null) headers['Origin'] = origin;

      considerCandidate(url, headers);
      return null;
    },
    onLoadStop: (controller, url) async {
      if (url != null) lastDocumentUrl = url.toString();
    },
  );

  try {
    await headlessWebView.run();
    timeoutTimer = Timer(timeout, finish);
    return await completer.future;
  } catch (_) {
    return null;
  } finally {
    settleTimer?.cancel();
    timeoutTimer?.cancel();
    await headlessWebView.dispose();
  }
}
