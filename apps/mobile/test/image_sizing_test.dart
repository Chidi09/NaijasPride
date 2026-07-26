import 'package:flutter_test/flutter_test.dart';
import 'package:naijaspride_mobile/core/utils/image_sizing.dart';

void main() {
  group('sizedImageUrl', () {
    test('downgrades a TMDB original to a width that fits the device', () {
      // The API stores backdrops at /original, which is 3840x2160 and around
      // half a megabyte — the reason onboarding artwork was slow to appear.
      expect(
        sizedImageUrl('https://image.tmdb.org/t/p/original/abc.jpg', 1080),
        'https://image.tmdb.org/t/p/w1280/abc.jpg',
      );
    });

    test('picks the smallest published width that still covers the target', () {
      expect(
        sizedImageUrl('https://image.tmdb.org/t/p/original/a.jpg', 300),
        'https://image.tmdb.org/t/p/w300/a.jpg',
      );
      expect(
        sizedImageUrl('https://image.tmdb.org/t/p/original/a.jpg', 301),
        'https://image.tmdb.org/t/p/w342/a.jpg',
      );
    });

    test('falls back to original above the largest published width', () {
      expect(
        sizedImageUrl('https://image.tmdb.org/t/p/w500/a.jpg', 2000),
        'https://image.tmdb.org/t/p/original/a.jpg',
      );
    });

    test('rewrites an already-sized URL rather than only original', () {
      expect(
        sizedImageUrl('https://image.tmdb.org/t/p/w780/a.jpg', 185),
        'https://image.tmdb.org/t/p/w185/a.jpg',
      );
    });

    test('leaves unknown hosts untouched', () {
      // AniList covers are already small and served from a CDN with no size
      // segment to rewrite; mangling the path would 404 the image.
      const anilist =
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.jpg';
      expect(sizedImageUrl(anilist, 1080), anilist);
      expect(
        sizedImageUrl('https://cdn.other.test/a.jpg', 500),
        'https://cdn.other.test/a.jpg',
      );
    });

    test('is a no-op on empty input or a nonsense target', () {
      expect(sizedImageUrl('', 500), '');
      expect(
        sizedImageUrl('https://image.tmdb.org/t/p/original/a.jpg', 0),
        'https://image.tmdb.org/t/p/original/a.jpg',
      );
    });
  });

  group('decodeWidthFor', () {
    test('scales the logical width by the device pixel ratio', () {
      expect(decodeWidthFor(400, 3), 1200);
    });

    test('clamps so a huge canvas cannot decode an enormous bitmap', () {
      // A 3840-wide JPEG decodes to roughly 33 MB regardless of the box it
      // is painted into, which is what this cap exists to prevent.
      expect(decodeWidthFor(1200, 4), 1440);
      expect(decodeWidthFor(20, 1), 180);
    });
  });
}
