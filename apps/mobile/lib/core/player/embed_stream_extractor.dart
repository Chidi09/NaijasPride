import 'dart:async';
import 'dart:collection';
import 'dart:typed_data';

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

/// Sandbox flags for the provider iframe. What's *omitted* is the point:
/// without `allow-top-navigation`, `allow-top-navigation-by-user-activation`,
/// `allow-popups` and `allow-popups-to-escape-sandbox`, the embed physically
/// cannot drive the WebView to an ad/scam page or spawn a pop-under — the
/// browser refuses the navigation itself, before any Dart callback would run.
///
/// This is the layer that actually stops the "tap the video, land on a scam
/// page" hijack on Android. [evaluateNavigationTarget] cannot: every embed in
/// this app runs *inside this iframe*, and flutter_inappwebview's Android
/// `WebViewClient.shouldOverrideUrlLoading` returns `request.isForMainFrame()`
/// — a sub-frame navigation is reported to Dart but always allowed, because
/// Android offers no way to load a URL into a non-main frame. So a
/// `NavigationActionPolicy.CANCEL` for anything happening in here was, and
/// would remain, a no-op without this attribute.
///
/// `allow-same-origin` has to stay: dropping it puts the frame in an opaque
/// origin, which breaks the providers' own storage/cookies and the
/// `flutter_inappwebview` JS bridge the media sniffer reports through. It is
/// safe to combine with `allow-scripts` here only because the frame is
/// cross-origin to the wrapper document, so it cannot reach out and remove
/// its own sandbox attribute.
const String _embedIframeSandbox =
    'allow-scripts allow-same-origin allow-forms allow-presentation '
    'allow-orientation-lock';

String wrapperHtmlFor(String embedUrl) {
  final escaped = embedUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return '''
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#000;overflow:hidden;">
<iframe src="$escaped" allow="autoplay; fullscreen; encrypted-media"
  sandbox="$_embedIframeSandbox" allowfullscreen
  style="position:fixed;top:0;left:0;width:100%;height:100%;border:0;"></iframe>
</body>
</html>
''';
}

/// Appends Vidking's documented `progress` parameter (start position, in
/// whole seconds) so a resumed episode opens where it was left rather than at
/// zero. Only Vidking specifies it; every other provider is returned
/// untouched, since an unknown query parameter on a strict player is a way to
/// break a working embed for no gain.
String withResumeProgress(String embedUrl, int seconds) {
  if (seconds <= 0) return embedUrl;
  final host = Uri.tryParse(embedUrl)?.host.toLowerCase() ?? '';
  if (!_isSameSite(host, 'vidking.net')) return embedUrl;
  final separator = embedUrl.contains('?') ? '&' : '?';
  return '$embedUrl${separator}progress=$seconds';
}

/// Relays the embed player's own playback telemetry out to Dart, so the
/// WebView fallback can save resume progress the way the native player does.
///
/// Runs in the *wrapper* document, listening for the `postMessage` ticks the
/// provider posts up from inside the iframe. That crossing works because the
/// sandbox keeps `allow-scripts` and `allow-same-origin`; dropping the latter
/// would still deliver the message but with `event.origin` reported as the
/// literal string `"null"`.
const String embedProgressBridgeJs = r'''
(function() {
  if (window.__nsProgressBridge) return;
  window.__nsProgressBridge = true;

  var lastSentAt = 0;

  function num(v) {
    var n = (typeof v === 'string') ? parseFloat(v) : v;
    return (typeof n === 'number' && isFinite(n) && n >= 0) ? n : null;
  }

  // Vidking documents a nested { type: 'PLAYER_EVENT', data: {...} } envelope
  // and also emits flatter ticks; other players differ again. Read whichever
  // shape arrives instead of betting the feature on one of them.
  function extract(payload) {
    if (!payload || typeof payload !== 'object') return null;
    var d = (payload.data && typeof payload.data === 'object') ? payload.data : payload;
    var currentTime = num(d.currentTime);
    var duration = num(d.duration);
    if (currentTime === null || duration === null || duration <= 0) return null;
    if (currentTime > duration) return null;
    return {
      currentTime: currentTime,
      duration: duration,
      event: String(d.event || d.type || '')
    };
  }

  window.addEventListener('message', function(ev) {
    try {
      var payload = ev.data;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (e) { return; }
      }
      var tick = extract(payload);
      if (!tick) return;

      // Deliberately not gated on ev.origin. A frame sandboxed without
      // allow-same-origin reports its origin as "null", so an origin equality
      // check silently discards every legitimate tick. The structural check
      // above stands in for it, and the only thing ever loaded in this
      // wrapper is the embed the app chose.
      var now = Date.now();
      var isFinal = tick.event === 'ended' || tick.event === 'pause';
      if (!isFinal && now - lastSentAt < 5000) return;
      lastSentAt = now;

      if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
        window.flutter_inappwebview.callHandler(
          'nsProgress', tick.currentTime, tick.duration, tick.event);
      }
    } catch (e) {}
  }, false);
})();
''';

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
  // Programmatic video ad exchanges (VAST/VPAID) — these are what feed a
  // preroll/midroll ad into the *embed provider's own* JW Player/Video.js/
  // Plyr instance before the movie/episode starts. Blocking the tag request
  // itself (not just the popup/redirect layer above) is what stops ads from
  // ever reaching the in-page video player.
  'spotxchange.com',
  'spotx.tv',
  'springserve.com',
  'freewheel.tv',
  'fwmrm.net',
  'adsafeprotected.com',
  'doubleverify.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'criteo.com',
  'casalemedia.com',
  'indexexchange.com',
  'sharethrough.com',
  'triplelift.com',
  'adform.net',
  'yieldmo.com',
  'contextweb.com',
  'undertone.com',
  'adtelligent.com',
  '3lift.com',
  'improvedigital.com',
  'vidoomy.com',
  // Forced-view link-shortener / "wait N seconds" ad gates, used to wrap
  // "server"/"download" links on piracy sites.
  'adf.ly',
  'linkvertise.com',
  'link-to.net',
  'exe.io',
  'exey.io',
  'shrinkme.io',
  'shrinkearn.com',
  'ouo.io',
  'ouo.press',
  'gplinks.in',
  'droplink.co',
  'adfoc.us',
  'shorte.st',
  'sh.st',
  'bc.vc',
  'clk.sh',
  'mboost.me',
  // Browser-notification ad spam ("Allow notifications to continue" prompts
  // that then push endless ad popups outside the app).
  'onesignal.com',
  'pushengage.com',
  'izooto.com',
  'truepush.com',
  'webpushr.com',
  'pushnami.com',
  'aimtell.com',
  // More pop-under / redirect networks common on streaming-embed pages.
  'zeropark.com',
  'propellerclick.com',
  'adk2.com',
  'clickosmedia.com',
  'trafficfactory.biz',
  'bitcotraffic.com',
  'popadscdn.net',
  'pop.cash',
];

/// CSS selectors for common ad containers/overlays injected by these embeds.
const List<String> _adBlockCosmeticSelectors = [
  'ins.adsbygoogle',
  'div[id^="ad-"]',
  'div[class*="popup"]',
  'div[class*="ad-overlay"]',
  'div[id*="preroll"]',
  'a[href*="//ads."]',
  'div[class*="ad-container"]',
  'div[id*="ad-container"]',
  'div[class*="ad-banner"]',
  'div[id*="ad-banner"]',
  'div[class*="video-ads"]',
  'div[class*="vast-"]',
  'div[class*="ima-"]',
  'div[id*="ima-"]',
  'div[class*="overlay-ad"]',
  'div[class*="modal-ad"]',
  'div[class*="notification-prompt"]',
  'div[class*="push-notification"]',
  'div[class*="subscribe-prompt"]',
  'iframe[src*="ads"]',
  'iframe[id*="ad-"]',
  'iframe[class*="ad-"]',
  'a[href*="popunder"]',
  'a[href*="/click"]',
  'div[class*="sponsor-banner"]',
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
        trigger: ContentBlockerTrigger(urlFilter: '.*${RegExp.escape(host)}.*'),
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
  if (isAdOrTrackerUrl(url)) return false;
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

/// Path/query heuristics for ad, click-tracker, redirect-gate and
/// forced-view URLs that aren't on a known host (piracy embeds rotate
/// throwaway ad domains faster than any static list can keep up), anchored
/// to path segments / query keys so it doesn't false-positive on unrelated
/// words appearing inside a legitimate path. Deliberately used only for the
/// navigation guard below, never for resource blocking — some legitimate
/// CDNs serve signed video URLs through a `/redirect/`-shaped path, and
/// blocking that as a *resource fetch* would break playback outright rather
/// than just block an ad.
final RegExp _adRedirectPathPattern = RegExp(
  r'/(click(out)?|redirect|redir|goto|popunder|pop-under|smartlink|adserver|advert|sponsor)(/|\.|$|\?)|[?&](click_?id|aff_?id|zone_?id|campaign_?id)=',
  caseSensitive: false,
);

final Set<String> _adBlockHostSet = {
  for (final h in _adBlockHosts) h.toLowerCase(),
};

/// True if [url]'s host is (or is a subdomain of) a known ad/tracker/
/// redirector/link-shortener/notification-spam host. Used for resource
/// blocking ([shouldInterceptRequest]) and media-candidate filtering, where
/// a false positive would silently break playback rather than just miss an
/// ad — so it deliberately does NOT use the looser path/query heuristics
/// below (see [isLikelyAdNavigation] for those).
bool isAdOrTrackerUrl(String url) {
  final host = Uri.tryParse(url)?.host.toLowerCase() ?? '';
  if (host.isEmpty) return false;
  return _adBlockHostSet.any((h) => host == h || host.endsWith('.$h'));
}

/// True if [url] is a known ad host OR matches the generic redirect/
/// click-tracker path heuristic. Only safe to use for whole-page
/// *navigation* decisions ([evaluateNavigationTarget]) — see the caveat on
/// [_adRedirectPathPattern].
bool isLikelyAdNavigation(String url) {
  return isAdOrTrackerUrl(url) || _adRedirectPathPattern.hasMatch(url);
}

/// A blocked network response — returned from `shouldInterceptRequest` in
/// place of letting an ad/tracker request reach the network. This is the
/// Dart-side counterpart to the native [adBlockerRules] `ContentBlocker`s:
/// content blockers alone can silently no-op on some Android WebView/OEM
/// builds, so every embed WebView in this app also blocks at this layer as
/// a second, independent line of defense.
WebResourceResponse blockedAdResourceResponse() =>
    WebResourceResponse(contentType: '', data: Uint8List(0));

/// The registrable domain of [host] ("player.videasy.net" → "videasy.net"),
/// with the handful of two-label public suffixes these providers actually
/// turn up on (`.co.uk`, `.com.br`, `.co.in`, …) accounted for. Used to keep
/// a provider's own CDN/redirect chain on the allowlist without dragging in
/// the entire TLD.
String _registrableDomain(String host) {
  final parts = host.split('.');
  if (parts.length <= 2) return host;
  const twoLabelSuffixHeads = {'co', 'com', 'net', 'org', 'gov', 'edu', 'ac'};
  if (parts[parts.length - 1].length == 2 &&
      twoLabelSuffixHeads.contains(parts[parts.length - 2])) {
    return parts.sublist(parts.length - 3).join('.');
  }
  return parts.sublist(parts.length - 2).join('.');
}

bool _isSameSite(String host, String other) {
  if (host.isEmpty || other.isEmpty) return false;
  if (host == other) return true;
  if (host.endsWith('.$other') || other.endsWith('.$host')) return true;
  return _registrableDomain(host) == _registrableDomain(other);
}

/// True if [url] belongs to the same site as [other] — i.e. it is the embed
/// provider talking to itself (its own CDN, its own resolver host) rather
/// than a third party. Lets a WebView tell "this server is alive and
/// serving" from "some unrelated host made a request".
bool isSameSiteUrl(String url, String other) {
  final a = Uri.tryParse(url)?.host.toLowerCase() ?? '';
  final b = Uri.tryParse(other)?.host.toLowerCase() ?? '';
  return _isSameSite(a, b);
}

final String _wrapperHost = Uri.parse(embedOrigin).host.toLowerCase();

/// Decides whether a *top-level* navigation out of the embed wrapper (a tap
/// anywhere on the page hijacked into a full-page ad, a fake "update your
/// player" redirect, an attempt to open the Play Store / a messaging app to
/// push an install) should be allowed to proceed. Content/resource blockers
/// only stop sub-resource loads (scripts, images, XHR) — they do nothing
/// against a page *navigating itself* to an ad/scam destination, which is
/// exactly what makes piracy embeds feel "ad-infested" even with a strong
/// blocklist in place.
///
/// Pass [embedUrl] (the provider page currently loaded in the wrapper) to get
/// **allowlist** behaviour: the wrapper's own origin and the provider's own
/// site may drive a top-level navigation, and nothing else may. A blocklist
/// cannot win here — these networks rotate throwaway domains far faster than
/// any static list is updated, so "not on the list" has to mean "blocked",
/// not "allowed". Legitimate cases are narrow enough for this to be safe:
/// the wrapper never needs to leave itself, and a provider redirecting
/// across its own CDN hosts stays same-site.
///
/// Without [embedUrl] it degrades to the old known-bad-destinations-only
/// check, which is strictly weaker but never breaks a working embed.
NavigationActionPolicy evaluateNavigationTarget(
  String url, {
  String? embedUrl,
}) {
  final uri = Uri.tryParse(url);
  if (uri == null) return NavigationActionPolicy.CANCEL;

  final scheme = uri.scheme.toLowerCase();
  // about:blank / about:srcdoc is how the WebView reports the wrapper
  // document it was handed via loadData, so it has to stay allowed.
  if (scheme == 'about') return NavigationActionPolicy.ALLOW;
  if (scheme != 'http' && scheme != 'https') {
    // Blocks intent://, market://, itms-apps://, tel:, sms:, whatsapp://,
    // viber:// etc. — the "open an app/store to push an install" vector.
    return NavigationActionPolicy.CANCEL;
  }
  if (isLikelyAdNavigation(url)) return NavigationActionPolicy.CANCEL;

  final host = uri.host.toLowerCase();
  if (host.isEmpty) return NavigationActionPolicy.CANCEL;
  if (_isSameSite(host, _wrapperHost)) return NavigationActionPolicy.ALLOW;

  if (embedUrl == null) return NavigationActionPolicy.ALLOW;
  final embedHost = Uri.tryParse(embedUrl)?.host.toLowerCase() ?? '';
  return _isSameSite(host, embedHost)
      ? NavigationActionPolicy.ALLOW
      : NavigationActionPolicy.CANCEL;
}

/// True if a request the WebView is about to make is an ad/scam *page* being
/// pulled into the embed iframe itself — the in-frame counterpart of the
/// hijack [evaluateNavigationTarget] blocks at the top level.
///
/// The iframe sandbox stops the embed navigating the *top* frame, and
/// [isAdOrTrackerUrl] stops known ad hosts, but neither stops an embed
/// replacing its own document with a page on a domain nobody has listed yet.
/// `shouldInterceptRequest` does see sub-frame document loads on Android, so
/// this is the one place that hijack can still be caught.
///
/// Deliberately narrower than the top-level allowlist: it only fires on the
/// generic ad/click-gate URL shapes, never on "cross-site" alone. Real
/// providers routinely nest a *different* company's player (vidsrc → its
/// resolver host, 2embed → its player host), and blocking cross-site
/// documents outright would break playback everywhere.
bool isBlockedEmbedDocumentRequest(String url, {required bool isForMainFrame}) {
  if (isForMainFrame) return false;
  return isLikelyAdNavigation(url);
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
    // Playerjs is the house player of most of these piracy embeds, and it
    // takes its manifest as a constructor option rather than through any
    // network call the fetch/XHR hooks above can see.
    try {
      if (window.Playerjs && !window.Playerjs.__ns) {
        var _pjs = window.Playerjs;
        var wrappedPjs = function(cfg) {
          try { scanConfig(cfg, 0); } catch (e) {}
          return new _pjs(cfg);
        };
        for (var pk in _pjs) { try { wrappedPjs[pk] = _pjs[pk]; } catch (e) {} }
        wrappedPjs.__ns = 1;
        window.Playerjs = wrappedPjs;
      }
    } catch (e) {}
    try {
      if (window.videojs && !window.videojs.__ns) {
        var _vjs = window.videojs;
        var wrappedVjs = function() {
          var player = _vjs.apply(this, arguments);
          try {
            if (player && player.src && !player.__ns) {
              player.__ns = 1;
              var _src = player.src;
              player.src = function(s) { try { scanConfig(s, 0); } catch (e) {} return _src.apply(this, arguments); };
            }
          } catch (e) {}
          return player;
        };
        for (var vk in _vjs) { try { wrappedVjs[vk] = _vjs[vk]; } catch (e) {} }
        wrappedVjs.__ns = 1;
        window.videojs = wrappedVjs;
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

String? _dynamicAdGuardJsCache;

/// JS-layer defense-in-depth against ads that native content blockers and
/// [shouldInterceptRequest] can't reach: `window.open` pop-unders, legacy
/// `document.write`-injected ad tags/iframes, and ad/overlay elements that
/// get inserted into the DOM *after* the page finishes loading (so static
/// CSS-hide rules never see them at parse time — a `MutationObserver`
/// catches them the instant they're added instead). This is what makes the
/// blocking feel "Brave-level" rather than a static blocklist: it reacts to
/// the page the way the page is actually trying to attack it.
String get dynamicAdGuardJs {
  final cached = _dynamicAdGuardJsCache;
  if (cached != null) return cached;

  final hostPattern = _adBlockHosts.map((h) => RegExp.escape(h)).join('|');
  final script =
      '''
(function() {
  if (window.__nsAdGuard) return;
  window.__nsAdGuard = true;
  var AD_HOST_RE = /(?:^|\\.)(?:$hostPattern)\$/i;

  function hostOf(u) {
    try { return new URL(u, location.href).hostname; } catch (e) { return ''; }
  }
  function isAdUrl(u) {
    if (!u || typeof u !== 'string') return false;
    try { return AD_HOST_RE.test(hostOf(u)); } catch (e) { return false; }
  }

  // Pop-unders / "open a new tab with an ad" — neutralize outright, this
  // app never needs the embed page to open anything itself.
  try { window.open = function() { return null; }; } catch (e) {}

  function sameSite(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var x = a.split('.').slice(-2).join('.');
    var y = b.split('.').slice(-2).join('.');
    return x === y;
  }

  // A tap that leaves the provider's own site is never something the embed
  // needs and always the hijack: an invisible full-viewport <a> laid over
  // the player, so "press play" is really "open the ad". The iframe sandbox
  // already blocks top-frame navigation and pop-ups, but an anchor without
  // a target navigates the frame in place, which the sandbox permits and
  // Location's unforgeable href/assign/replace can't be hooked to stop —
  // so it has to be cancelled at the click.
  function isHijackNav(u) {
    if (!u) return false;
    var s = String(u).trim();
    if (!s || s.charAt(0) === '#') return false;
    if (/^(javascript|blob|data|mailto):/i.test(s)) return false;
    if (isAdUrl(s)) return true;
    var h = hostOf(s);
    if (!h) return false;
    return !sameSite(h, location.hostname);
  }
  try {
    document.addEventListener('click', function(ev) {
      try {
        var t = ev.target;
        var a = (t && t.closest) ? t.closest('a[href]') : null;
        if (!a) return;
        if (isHijackNav(a.getAttribute('href'))) {
          ev.preventDefault();
          ev.stopPropagation();
        }
      } catch (e) {}
    }, true);
  } catch (e) {}

  // Legacy ad tags still commonly injected via document.write(<script>/<iframe>).
  try {
    var _write = document.write.bind(document);
    var _writeln = document.writeln.bind(document);
    function guard(fn) {
      return function(html) {
        try {
          if (typeof html === 'string' && /<(script|iframe)\\b[^>]*(src|href)=/i.test(html)) {
            var m = html.match(/(?:src|href)=["']([^"']+)["']/i);
            if (m && isAdUrl(m[1])) return;
          }
        } catch (e) {}
        return fn(html);
      };
    }
    document.write = guard(_write);
    document.writeln = guard(_writeln);
  } catch (e) {}

  // Remove/hide ad elements the instant they're inserted, including
  // full-viewport "click anywhere to continue" overlays injected well after
  // the initial page load (skips anything that contains the real <video>).
  function scrub(node) {
    if (!node || node.nodeType !== 1) return;
    try {
      var tag = node.tagName;
      if (tag === 'IFRAME' || tag === 'SCRIPT' || tag === 'A') {
        var src = node.getAttribute('src') || node.getAttribute('href');
        if (isAdUrl(src)) { node.remove(); return; }
      }
      // Full-viewport click-catchers. <A> counts too — the most common
      // shape is a transparent anchor stretched over the player — and the
      // z-index bar is 100 rather than 999 because plenty of these ship
      // with a modest z-index and still sit on top of everything.
      if (tag === 'DIV' || tag === 'INS' || tag === 'A') {
        var style = window.getComputedStyle(node);
        if (style && (style.position === 'fixed' || style.position === 'absolute')) {
          var z = parseInt(style.zIndex, 10) || 0;
          var r = node.getBoundingClientRect();
          var coversViewport = r.width >= window.innerWidth * 0.8 && r.height >= window.innerHeight * 0.8;
          var hasRealPlayer = node.querySelector('video') || node.querySelector('iframe');
          if (z >= 100 && coversViewport && !hasRealPlayer) {
            node.style.setProperty('display', 'none', 'important');
            node.style.setProperty('pointer-events', 'none', 'important');
          }
        }
      }
      if (node.querySelectorAll) {
        node.querySelectorAll('iframe[src], script[src], a[href]').forEach(function(el) {
          var s = el.getAttribute('src') || el.getAttribute('href');
          if (isAdUrl(s)) el.remove();
        });
      }
    } catch (e) {}
  }

  try {
    var mo = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) scrub(added[j]);
      }
    });
    var target = document.documentElement || document;
    mo.observe(target, { childList: true, subtree: true });
  } catch (e) {}

  document.addEventListener('DOMContentLoaded', function() {
    try {
      document.querySelectorAll('iframe[src], script[src], a[href]').forEach(function(el) {
        var s = el.getAttribute('src') || el.getAttribute('href');
        if (isAdUrl(s)) el.remove();
      });
    } catch (e) {}
  });
})();
''';

  _dynamicAdGuardJsCache = script;
  return script;
}

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
        source: dynamicAdGuardJs,
        injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
        forMainFrameOnly: false,
      ),
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
      useShouldOverrideUrlLoading: true,
      mediaPlaybackRequiresUserGesture: false,
      userAgent: desktopUserAgent,
      transparentBackground: true,
      mixedContentMode: MixedContentMode.MIXED_CONTENT_ALWAYS_ALLOW,
      thirdPartyCookiesEnabled: true,
      supportMultipleWindows: false,
      javaScriptCanOpenWindowsAutomatically: false,
      contentBlockers: adBlockerRules,
    ),
    shouldOverrideUrlLoading: (controller, navigationAction) async {
      // The sniffer's #1 reliability problem: an embed page redirects
      // itself (or its iframe) to an ad/scam landing page before the real
      // player ever loads, so no stream candidate is ever found and the app
      // falls back to the ad-laden WebView. Cancelling known-bad
      // navigations here lets the real page (and its stream) keep loading
      // instead.
      final url = navigationAction.request.url?.toString();
      if (url == null) return NavigationActionPolicy.ALLOW;
      return evaluateNavigationTarget(url, embedUrl: embedUrl);
    },
    onCreateWindow: (controller, createWindowAction) async {
      // Never let the hidden sniffing WebView spawn a popup.
      return false;
    },
    onWebViewCreated: (controller) async {
      controller.addJavaScriptHandler(
        handlerName: 'nsMedia',
        callback: (args) {
          if (settled) return;
          if (args.isNotEmpty && args.first is String) {
            final u = args.first as String;
            if (_mediaUrlPattern.hasMatch(u) && !isAdOrTrackerUrl(u)) {
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

      // Second, independent layer of ad/tracker blocking beneath the
      // native [adBlockerRules] content blockers — belt-and-braces, since
      // content blocker behavior can be inconsistent across Android
      // WebView/OEM builds.
      if (isAdOrTrackerUrl(url)) {
        return blockedAdResourceResponse();
      }
      if (isBlockedEmbedDocumentRequest(
        url,
        isForMainFrame: request.isForMainFrame == true,
      )) {
        return blockedAdResourceResponse();
      }

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

      if (!_mediaUrlPattern.hasMatch(url)) {
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
