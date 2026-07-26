import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:naijaspride_mobile/core/player/embed_stream_extractor.dart';

/// A provider page of the shape the embed screens actually load.
const _embed =
    'https://www.vidking.net/embed/tv/119051/1/8?color=800020&autoPlay=true';

void main() {
  group('wrapperHtmlFor sandbox', () {
    final html = wrapperHtmlFor(_embed);
    final strict = wrapperHtmlFor(_embed, strictAdBlocking: true);

    test('does not sandbox the provider iframe by default', () {
      // On-device this was the difference between every movie and TV
      // provider playing and every one of them refusing with its own
      // "remove the sandbox attribute from the iframe tag" page. The
      // providers detect the attribute deliberately — it is what stops the
      // pop-unders they monetise — so no choice of tokens buys past it.
      expect(html, isNot(contains('sandbox=')));
    });

    test('sandboxes when strict ad blocking is opted into', () {
      expect(strict, contains('sandbox="'));
    });

    test('strict mode withholds the capabilities an ad hijack needs', () {
      // flutter_inappwebview's Android shouldOverrideUrlLoading only cancels
      // main-frame navigations, so nothing on the Dart side can stop the
      // embed — which runs in this iframe — navigating itself off-site.
      // Closing that last gap is the whole reason strict mode exists.
      expect(strict, isNot(contains('allow-top-navigation')));
      expect(strict, isNot(contains('allow-popups')));
      expect(strict, isNot(contains('allow-modals')));
      expect(strict, isNot(contains('allow-downloads')));
    });

    test('strict mode keeps what the provider needs to play', () {
      // Without allow-same-origin the frame lands in an opaque origin, which
      // breaks provider storage and the JS bridge the sniffer reports over.
      expect(strict, contains('allow-same-origin'));
      expect(strict, contains('allow-scripts'));
    });

    test('always allows fullscreen', () {
      expect(html, contains('allowfullscreen'));
      expect(strict, contains('allowfullscreen'));
    });

    test('escapes the embed URL into the src attribute', () {
      expect(html, contains('color=800020&amp;autoPlay=true'));
      // A quote in a provider URL must not be able to break out of src="…"
      // and inject attributes of its own.
      expect(
        wrapperHtmlFor('https://x.test/e?a="onload=alert(1)'),
        contains('a=&quot;onload=alert(1)'),
      );
      expect(
        wrapperHtmlFor(
          'https://x.test/e?a="onload=alert(1)',
          strictAdBlocking: true,
        ),
        contains('a=&quot;onload=alert(1)'),
      );
    });
  });

  group('subtitle sniffing', () {
    test('recognises the track formats embed players fetch', () {
      for (final url in const [
        'https://cdn.x.com/subs/english.vtt',
        'https://cdn.x.com/subs/eng.srt?token=1',
        'https://cdn.x.com/subs/full.ass',
      ]) {
        expect(isLikelySubtitleUrl(url), isTrue, reason: url);
      }
    });

    test('rejects media and ad assets', () {
      expect(isLikelySubtitleUrl('https://cdn.x.com/master.m3u8'), isFalse);
      expect(isLikelySubtitleUrl('https://popads.net/a.vtt'), isFalse);
    });

    test('never mistakes a subtitle for a playable stream', () {
      // Both predicates run over the same sniffed URLs, so an overlap would
      // hand a .vtt to the video player as if it were the episode.
      expect(isLikelyMediaStreamUrl('https://cdn.x.com/subs/en.vtt'), isFalse);
    });

    test('labels tracks from the language in the file name', () {
      expect(subtitleLabelFor('https://cdn.x.com/s/english-2.vtt'), 'English');
      expect(subtitleLabelFor('https://cdn.x.com/s/spa.srt'), 'Spanish');
      // No recognisable language: fall back to something that at least
      // distinguishes two tracks in the picker.
      expect(subtitleLabelFor('https://cdn.x.com/s/track1.vtt'), 'track1');
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
