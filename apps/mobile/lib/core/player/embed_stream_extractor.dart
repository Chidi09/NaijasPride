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

/// Ad/tracker/pop-under hosts that piracy embed providers load. Blocking these
/// at the network layer (plus the cosmetic selectors below and pop-up
/// suppression in the WebView settings) is what makes the fallback
/// embed pages actually watchable — a "Brave-level" content blocker built from
/// flutter_inappwebview's native [ContentBlocker] rules rather than a plugin.
const List<String> _adBlockHosts = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googletagservices.com',
  'adservice.google.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'adsystem.com',
  'scorecardresearch.com',
  'popads.net',
  'popcash.net',
  'popmyads.com',
  'poptm.com',
  'propellerads.com',
  'propu.sh',
  'propellerpops.com',
  'onclickalgo.com',
  'onclickmax.com',
  'onclickmega.com',
  'onclckds.com',
  'clickadu.com',
  'exoclick.com',
  'exosrv.com',
  'juicyads.com',
  'trafficjunky.com',
  'trafficjunky.net',
  'adsterra.com',
  'hilltopads.net',
  'hilltopads.com',
  'a-ads.com',
  'mgid.com',
  'adskeeper.com',
  'revcontent.com',
  'taboola.com',
  'outbrain.com',
  'bidgear.com',
  'bidvertiser.com',
  'adcash.com',
  'coinzilla.com',
  'mc.yandex.ru',
  'histats.com',
  'quantserve.com',
  'zedo.com',
  'servedbyadbutler.com',
  'luckyforbet.com',
  'pushncode.com',
  'vidstat.net',
  'stream-ads.com',
  // Additional pop-under / redirect / smartlink networks common to piracy embeds
  'popunder.net',
  'popundertotal.com',
  'popcash.com',
  'clickaine.com',
  'adnium.com',
  'ad-maven.com',
  'admaven.com',
  'go.ad-maven.com',
  'admedia.com',
  'admixer.net',
  'adplxmd.com',
  'adsterra.net',
  'ad-delivery.net',
  'adservetx.media.net',
  'media.net',
  'smartadserver.com',
  'smartlink.click',
  'yllix.com',
  'clickad.click',
  'clickadilla.com',
  'monetag.com',
  'galaksion.com',
  'adexchangeprestige.com',
  'trafficstars.com',
  'tsyndicate.com',
  'chaturbate.com',
  'creativecdn.com',
  'servedby-buysellads.com',
  'buysellads.com',
  'popimg.com',
  'poplink.com',
  'clksite.com',
  'clkmon.com',
  'clickfuse.com',
  'go2affise.com',
  'affise.com',
  'ero-advertising.com',
  'eroadvertising.com',
  'plugrush.com',
  'trafficforce.com',
  'trafficshop.com',
  'reporo.net',
  'adxpansion.com',
  'sedotmp.com',
  'onclicksuper.com',
  'onclicka.net',
  'onedmp.com',
  'onclick.pro',
  'partners.tremorhub.com',
  'push-house.com',
  'pushwhy.com',
  'push-ad.com',
  'pushpad.xyz',
  'notifysrv.com',
  'cdn.notifio.com',
  'sub2tech.com',
  'push.services.mozilla.com',
  'webpushs.com',
  'notix.io',
  'richpush.co',
  'roller-ads.com',
  'rollerads.com',
  'datu.ovh',
  'tags.crwdcntrl.net',
  'crwdcntrl.net',
  'moatads.com',
  'imasdk.googleapis.com',
  'pagead2.googlesyndication.com',
  'securepubads.g.doubleclick.net',
  'adservice.google.co',
  'cointraffic.io',
  'coinhive.com',
  'coin-hive.com',
  'cryptaloot.pro',
  'crypto-loot.com',
  'coinimp.com',
  'webminepool.com',
  'jsecoin.com',
  'minero.cc',
  'browsermine.com',
  'bmst.pw',
  'deloton.com',
  'luckypushh.com',
  'luckypush.com',
  'highperformanceformat.com',
  'displaycontentnetwork.com',
  'effectivecpmgate.com',
  'cpmterra.com',
  'cpmrocket.com',
  'revenuehits.com',
  'runative-syndicate.com',
  'adsyndicate.com',
  'syndication.exdynsrv.com',
  'exdynsrv.com',
  'exoticads.com',
  'waframedia5.com',
  'wafflemedia.com',
  'realsrv.com',
  'magsrv.com',
];

/// CSS selectors for common ad containers/overlays injected by these embeds.
const List<String> _adBlockCosmeticSelectors = [
  'ins.adsbygoogle',
  'div[id^="ad-"]',
  'div[class*="popup"]',
  'div[class*="ad-overlay"]',
  'div[id*="preroll"]',
  'a[href*="//ads."]',
];

UnmodifiableListView<ContentBlocker>? _adBlockerRules;

/// A reusable "Brave-level" ad/pop-up content-blocker list for embed WebViews.
/// Combines network blocking of [_adBlockHosts] with cosmetic hiding of
/// [_adBlockCosmeticSelectors]. Pass into `InAppWebViewSettings.contentBlockers`.
UnmodifiableListView<ContentBlocker> get adBlockerRules {
  final cached = _adBlockerRules;
  if (cached != null) return cached;

  final rules = <ContentBlocker>[
    for (final host in _adBlockHosts)
      ContentBlocker(
        trigger: ContentBlockerTrigger(
          urlFilter: '.*${RegExp.escape(host)}.*',
        ),
        action: ContentBlockerAction(type: ContentBlockerActionType.BLOCK),
      ),
    ContentBlocker(
      trigger: ContentBlockerTrigger(urlFilter: '.*'),
      action: ContentBlockerAction(
        type: ContentBlockerActionType.CSS_DISPLAY_NONE,
        selector: _adBlockCosmeticSelectors.join(', '),
      ),
    ),
  ];

  final built = UnmodifiableListView(rules);
  _adBlockerRules = built;
  return built;
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
  // A media indicator can appear on non-video resources (e.g. 2embed's
  // `.../playlist.json`, tracker `.js`, subtitle `.vtt`). Reject anything whose
  // path ends in a clearly non-playable extension before trusting the pattern.
  if (_nonMediaExtensionPattern.hasMatch(path)) return false;
  return _mediaUrlPattern.hasMatch(url);
}

final RegExp _nonMediaExtensionPattern = RegExp(
  r'\.(json|js|css|vtt|srt|ass|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|html?|php)$',
  caseSensitive: false,
);

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
  var seen = {};
  function abs(u) {
    try {
      if (!u || typeof u !== 'string') return null;
      if (u.indexOf('blob:') === 0 || u.indexOf('data:') === 0) return null;
      if (u.indexOf('//') === 0) return location.protocol + u;
      if (u.indexOf('http') === 0) return u;
      return new URL(u, location.href).href;
    } catch (e) { return null; }
  }
  function report(raw) {
    try {
      var u = abs(raw);
      if (!u || u.indexOf('http') !== 0) return;
      if (!re.test(u)) return;
      if (seen[u]) return;
      seen[u] = 1;
      if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
        window.flutter_inappwebview.callHandler('nsMedia', u);
      }
    } catch (e) {}
  }
  // --- Network hooks -------------------------------------------------------
  try {
    var _f = window.fetch;
    if (_f) window.fetch = function(a, b) {
      try { report((typeof a === 'string') ? a : (a && a.url)); } catch (e) {}
      var p = _f.apply(this, arguments);
      try { if (p && p.then) p.then(function(res){ try { report(res && res.url); } catch (e) {} }, function(){}); } catch (e) {}
      return p;
    };
  } catch (e) {}
  try {
    var _o = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u) {
      try {
        report(u);
        this.addEventListener('readystatechange', function() {
          try { if (this.responseURL) report(this.responseURL); } catch (e) {}
        });
      } catch (e) {}
      return _o.apply(this, arguments);
    };
  } catch (e) {}
  // --- Element src hooks (property + attribute) ----------------------------
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
  try {
    var _sa = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      try { if (name && /^(src|data-src|data-hls|data-url|data-file)$/i.test(name)) report(value); } catch (e) {}
      return _sa.apply(this, arguments);
    };
  } catch (e) {}
  // --- Player-library hooks (MSE/blob players expose the manifest here) -----
  function scanConfig(cfg, depth) {
    try {
      if (!cfg || depth > 4) return;
      if (typeof cfg === 'string') { report(cfg); return; }
      if (typeof cfg !== 'object') return;
      var keys = ['file', 'src', 'url', 'source', 'sources', 'playlist', 'hls', 'dash', 'manifest'];
      for (var i = 0; i < keys.length; i++) {
        var v = cfg[keys[i]];
        if (v == null) continue;
        if (typeof v === 'string') report(v);
        else if (Array.isArray(v)) { for (var j = 0; j < v.length; j++) scanConfig(v[j], depth + 1); }
        else if (typeof v === 'object') scanConfig(v, depth + 1);
      }
    } catch (e) {}
  }
  function hookPlayers() {
    try {
      if (window.Hls && window.Hls.prototype && !window.Hls.prototype.__ns) {
        window.Hls.prototype.__ns = 1;
        var _ls = window.Hls.prototype.loadSource;
        if (_ls) window.Hls.prototype.loadSource = function(u) { try { report(u); } catch (e) {} return _ls.apply(this, arguments); };
      }
    } catch (e) {}
    try {
      if (window.dashjs && window.dashjs.MediaPlayer && !window.__nsDash) {
        window.__nsDash = 1;
        var mp = window.dashjs.MediaPlayer();
        var _create = mp.create;
        mp.create = function() {
          var inst = _create.apply(this, arguments);
          try {
            var _at = inst.attachSource;
            if (_at) inst.attachSource = function(u) { try { report(u); } catch (e) {} return _at.apply(this, arguments); };
          } catch (e) {}
          return inst;
        };
      }
    } catch (e) {}
    try {
      if (window.jwplayer && !window.jwplayer.__ns) {
        var _jw = window.jwplayer;
        var wrapped = function() {
          var inst = _jw.apply(this, arguments);
          try {
            if (inst && inst.setup && !inst.__ns) {
              inst.__ns = 1;
              var _s = inst.setup;
              inst.setup = function(cfg) { try { scanConfig(cfg, 0); } catch (e) {} return _s.apply(this, arguments); };
            }
          } catch (e) {}
          return inst;
        };
        for (var k in _jw) { try { wrapped[k] = _jw[k]; } catch (e) {} }
        wrapped.__ns = 1;
        window.jwplayer = wrapped;
      }
    } catch (e) {}
  }
  // --- Periodic DOM + inline-script regex scan -----------------------------
  var scanRe = /https?:\/\/[^\s"'<>()\\]+?\.(?:m3u8|mpd)(?:[?#][^\s"'<>()\\]*)?/ig;
  function scanDom() {
    try {
      document.querySelectorAll('video, source').forEach(function(el) { report(el.currentSrc || el.src); });
    } catch (e) {}
    try {
      var html = document.documentElement ? document.documentElement.innerHTML : '';
      scanRe.lastIndex = 0;
      var m, c = 0;
      while ((m = scanRe.exec(html)) !== null && c < 25) { report(m[0]); c++; }
    } catch (e) {}
  }
  hookPlayers();
  var ticks = 0;
  var iv = setInterval(function() {
    ticks++;
    hookPlayers();
    scanDom();
    if (ticks > 60) clearInterval(iv);
  }, 700);
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
    } else if (url.contains('.mpd')) {
      score += 90;
    } else if (url.contains('.mp4')) {
      score += 50;
    } else if (url.contains('manifest')) {
      score += 60;
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
      supportMultipleWindows: false,
      javaScriptCanOpenWindowsAutomatically: false,
      contentBlockers: adBlockerRules,
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
