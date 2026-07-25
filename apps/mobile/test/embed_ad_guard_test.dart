import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naijaspride_mobile/core/player/embed_stream_extractor.dart';

/// A provider page of the shape the embed screens actually load.
const _embed =
    'https://www.vidking.net/embed/tv/119051/1/8?color=800020&autoPlay=true';

void main() {
  group('wrapperHtmlFor sandbox', () {
    final html = wrapperHtmlFor(_embed);

    test('sandboxes the provider iframe', () {
      expect(html, contains('sandbox="'));
    });

    test('withholds the capabilities an ad hijack needs', () {
      // These are the whole point of the attribute. flutter_inappwebview's
      // Android shouldOverrideUrlLoading only cancels main-frame
      // navigations, so nothing on the Dart side can stop the embed — which
      // runs in this iframe — from navigating the top frame or popping under.
      expect(html, isNot(contains('allow-top-navigation')));
      expect(html, isNot(contains('allow-popups')));
      expect(html, isNot(contains('allow-modals')));
      expect(html, isNot(contains('allow-downloads')));
    });

    test('keeps what the provider needs to play', () {
      // Without allow-same-origin the frame lands in an opaque origin, which
      // breaks provider storage and the JS bridge the sniffer reports over.
      expect(html, contains('allow-same-origin'));
      expect(html, contains('allow-scripts'));
      expect(html, contains('allowfullscreen'));
    });

    test('escapes the embed URL into the src attribute', () {
      expect(html, contains('color=800020&amp;autoPlay=true'));
      // A quote in a provider URL must not be able to break out of src="…"
      // and inject attributes of its own.
      expect(
        wrapperHtmlFor('https://x.test/e?a="onload=alert(1)'),
        contains('a=&quot;onload=alert(1)'),
      );
    });
  });

  group('evaluateNavigationTarget', () {
    test('allows the provider navigating within its own site', () {
      expect(
        evaluateNavigationTarget(
          'https://www.vidking.net/player/inner',
          embedUrl: _embed,
        ),
        NavigationActionPolicy.ALLOW,
      );
      expect(
        evaluateNavigationTarget('https://cdn.vidking.net/x', embedUrl: _embed),
        NavigationActionPolicy.ALLOW,
      );
    });

    test('allows the wrapper origin', () {
      expect(
        evaluateNavigationTarget(
          'https://www.naijaspride.com/',
          embedUrl: _embed,
        ),
        NavigationActionPolicy.ALLOW,
      );
    });

    test('allows about: — how loadData reports the wrapper document', () {
      expect(
        evaluateNavigationTarget('about:blank', embedUrl: _embed),
        NavigationActionPolicy.ALLOW,
      );
    });

    test('cancels an unlisted off-site destination', () {
      // The case a blocklist can never win: a throwaway domain nobody has
      // catalogued, with nothing ad-shaped in its path.
      expect(
        evaluateNavigationTarget(
          'https://kjh8s2plq.xyz/p/9912',
          embedUrl: _embed,
        ),
        NavigationActionPolicy.CANCEL,
      );
    });

    test('cancels known ad hosts and click-gate paths', () {
      expect(
        evaluateNavigationTarget('https://popads.net/x', embedUrl: _embed),
        NavigationActionPolicy.CANCEL,
      );
      expect(
        evaluateNavigationTarget(
          'https://example.com/redirect?click_id=9',
          embedUrl: _embed,
        ),
        NavigationActionPolicy.CANCEL,
      );
    });

    test('cancels app-launch schemes', () {
      for (final url in const [
        'intent://scan#Intent;scheme=x;end',
        'market://details?id=com.x',
        'whatsapp://send?text=hi',
        'tel:+2348000000',
      ]) {
        expect(
          evaluateNavigationTarget(url, embedUrl: _embed),
          NavigationActionPolicy.CANCEL,
          reason: url,
        );
      }
    });

    test('without embedUrl, falls back to blocklist-only behaviour', () {
      // Weaker on purpose: a caller that cannot say which provider is loaded
      // must not start cancelling navigations a working embed depends on.
      expect(
        evaluateNavigationTarget('https://kjh8s2plq.xyz/p/9912'),
        NavigationActionPolicy.ALLOW,
      );
      expect(
        evaluateNavigationTarget('https://popads.net/x'),
        NavigationActionPolicy.CANCEL,
      );
    });
  });

  group('isBlockedEmbedDocumentRequest', () {
    test('blocks an ad-shaped sub-frame document', () {
      expect(
        isBlockedEmbedDocumentRequest(
          'https://popads.net/lander',
          isForMainFrame: false,
        ),
        isTrue,
      );
    });

    test('leaves a provider nesting another company\'s player alone', () {
      // vidsrc -> its resolver host, 2embed -> its player host. Blocking
      // cross-site documents outright would break playback everywhere.
      expect(
        isBlockedEmbedDocumentRequest(
          'https://cloudnestra.com/rcp/abc',
          isForMainFrame: false,
        ),
        isFalse,
      );
    });

    test('never fires on the main frame', () {
      expect(
        isBlockedEmbedDocumentRequest(
          'https://popads.net/lander',
          isForMainFrame: true,
        ),
        isFalse,
      );
    });
  });

  group('isSameSiteUrl', () {
    test('matches host, subdomain and registrable domain', () {
      expect(isSameSiteUrl('https://a.vidking.net/x', _embed), isTrue);
      expect(isSameSiteUrl('https://www.vidking.net/y', _embed), isTrue);
    });

    test('rejects a different site', () {
      expect(isSameSiteUrl('https://vidsrc.xyz/x', _embed), isFalse);
    });
  });

  group('withResumeProgress', () {
    test('appends Vidking\'s documented progress parameter', () {
      expect(withResumeProgress(_embed, 942), '$_embed&progress=942');
      expect(
        withResumeProgress('https://www.vidking.net/embed/movie/1078605', 60),
        'https://www.vidking.net/embed/movie/1078605?progress=60',
      );
    });

    test('leaves other providers untouched', () {
      // An unrecognised query parameter on a strict player is a way to break
      // a working embed for nothing — only Vidking documents this one.
      const vidsrc =
          'https://vidsrc-embed.su/embed/tv?tmdb=1399&season=1&episode=1';
      expect(withResumeProgress(vidsrc, 942), vidsrc);
      expect(
        withResumeProgress('https://www.2embed.online/embed/tv/1399/1/1', 942),
        'https://www.2embed.online/embed/tv/1399/1/1',
      );
    });

    test('is a no-op without a resume point', () {
      expect(withResumeProgress(_embed, 0), _embed);
      expect(withResumeProgress(_embed, -5), _embed);
    });
  });

  group('isLikelyMediaStreamUrl', () {
    test('accepts real manifests', () {
      expect(isLikelyMediaStreamUrl('https://cdn.x.com/master.m3u8'), isTrue);
      expect(isLikelyMediaStreamUrl('https://cdn.x.com/manifest.mpd'), isTrue);
    });

    test('rejects segments, ad assets and non-media look-alikes', () {
      expect(isLikelyMediaStreamUrl('https://cdn.x.com/seg-12.ts'), isFalse);
      expect(
        isLikelyMediaStreamUrl('https://cdn.x.com/ads/preroll.mp4'),
        isFalse,
      );
      expect(isLikelyMediaStreamUrl('https://x.com/playlist.json'), isFalse);
      expect(isLikelyMediaStreamUrl('https://popads.net/a.m3u8'), isFalse);
    });
  });
}
