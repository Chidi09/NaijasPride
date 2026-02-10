import * as cheerio from 'cheerio';

export const extractChapterImageUrls = (
  html: string,
  toAbsoluteUrl: (url?: string | null) => string | null
): string[] => {
  const $ = cheerio.load(html || '');
  const imageSet = new Set<string>();

  $('img').each((_idx, el) => {
    const src = $(el).attr('data-src') || $(el).attr('src');
    const absolute = toAbsoluteUrl(src || null);
    if (!absolute) return;
    if (!/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(absolute)) return;
    imageSet.add(absolute);
  });

  const inlineImageUrlRegex = new RegExp(
    `https?:\\/\\/[^"'\\s]+\\.(?:jpg|jpeg|png|webp|avif)(?:\\?[^"'\\s]*)?`,
    'gi'
  );
  const inlineMatches = html.match(inlineImageUrlRegex) || [];
  for (const url of inlineMatches) {
    imageSet.add(url);
  }

  return Array.from(imageSet);
};
