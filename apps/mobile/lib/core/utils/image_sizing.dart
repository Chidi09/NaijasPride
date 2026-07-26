/// Rewrites known image-CDN URLs to the smallest variant that still covers
/// the space they are being drawn into.
///
/// The API stores TMDB backdrops at `/t/p/original`, which is 3840x2160 and
/// around half a megabyte each — fine for a desktop hero, ruinous on a phone
/// that only needs 1080 pixels across and is fetching several at once. TMDB
/// serves the same image at fixed widths from the same path, so the size can
/// be chosen at the point of use without touching stored data.
library;

/// TMDB's published `poster`/`backdrop` widths, ascending. `original` is the
/// implicit last resort.
const List<int> _tmdbWidths = [92, 154, 185, 300, 342, 500, 780, 1280];

final RegExp _tmdbPathPattern = RegExp(
  r'^(https?://image\.tmdb\.org/t/p/)([^/]+)(/.*)$',
  caseSensitive: false,
);

/// Returns [url] pointing at a variant at least [targetWidth] px wide.
///
/// Anything that isn't a recognised CDN URL is returned untouched, so this is
/// always safe to apply — an unknown host simply keeps whatever it had.
String sizedImageUrl(String url, int targetWidth) {
  if (url.isEmpty || targetWidth <= 0) return url;

  final tmdb = _tmdbPathPattern.firstMatch(url);
  if (tmdb != null) {
    final size = _tmdbWidths.firstWhere(
      (w) => w >= targetWidth,
      orElse: () => -1,
    );
    final segment = size == -1 ? 'original' : 'w$size';
    return '${tmdb.group(1)}$segment${tmdb.group(3)}';
  }

  return url;
}

/// The decode width to hand [CachedNetworkImage.memCacheWidth].
///
/// Decoding at the source resolution is what actually costs memory — a
/// 3840-wide JPEG decodes to roughly 33 MB of bitmap regardless of the box it
/// is painted into. Capping at the device's own pixel width keeps that in
/// proportion without any visible softness.
int decodeWidthFor(double logicalWidth, double devicePixelRatio) {
  final physical = (logicalWidth * devicePixelRatio).round();
  return physical.clamp(180, 1440);
}
