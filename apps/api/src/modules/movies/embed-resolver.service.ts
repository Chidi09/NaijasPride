/**
 * Embed Resolver Service
 *
 * Given a movie's IMDB ID and/or TMDB ID, returns an ordered list of
 * third-party embed iframe URLs.  No scraping, no Playwright — pure
 * URL templates.  The frontend tries providers in order; if one fails
 * the user can switch to the next via the server selector.
 */

export type EmbedProvider = {
  /** Unique key used in the frontend server selector */
  id: string;
  /** Human-readable label */
  name: string;
  /** The iframe src URL */
  url: string;
  /** Whether this provider posts playback events via window.postMessage */
  supportsProgressEvents: boolean;
};

/** Providers ordered by reliability / quality (best first). */
const PROVIDER_TEMPLATES: {
  id: string;
  name: string;
  supportsProgressEvents: boolean;
  /** Return null if the required IDs are missing */
  buildUrl: (imdbId: string | null, tmdbId: number | null) => string | null;
}[] = [
  {
    id: 'vidsrc-me',
    name: 'VidSrc',
    supportsProgressEvents: false,
    buildUrl: (imdbId) => (imdbId ? `https://vidsrc.me/embed/movie?imdb=${imdbId}` : null),
  },
  {
    id: 'vidsrc-xyz',
    name: 'VidSrc 2',
    supportsProgressEvents: false,
    buildUrl: (imdbId) => (imdbId ? `https://vidsrc.xyz/embed/movie/${imdbId}` : null),
  },
  {
    id: 'vidsrc-to',
    name: 'VidSrc Pro',
    supportsProgressEvents: false,
    buildUrl: (imdbId) => (imdbId ? `https://vidsrc.to/embed/movie/${imdbId}` : null),
  },
  {
    id: '2embed',
    name: '2Embed',
    supportsProgressEvents: false,
    buildUrl: (imdbId) => (imdbId ? `https://www.2embed.cc/embed/${imdbId}` : null),
  },
  {
    id: 'autoembed',
    name: 'AutoEmbed',
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId) => {
      if (imdbId) return `https://autoembed.co/movie/imdb/${imdbId}`;
      if (tmdbId) return `https://autoembed.co/movie/tmdb/${tmdbId}`;
      return null;
    },
  },
  {
    id: 'multiembed',
    name: 'SuperEmbed',
    supportsProgressEvents: false,
    buildUrl: (imdbId) => (imdbId ? `https://multiembed.mov/directstream.php?video_id=${imdbId}` : null),
  },
  {
    id: 'vidking',
    name: 'Vidking',
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId) =>
      tmdbId ? `https://www.vidking.net/embed/movie/${tmdbId}?color=800020&autoPlay=true` : null,
  },
];

export class EmbedResolverService {
  /**
   * Returns all embed providers that can serve this movie.
   * Order is stable (best-first) so the frontend can iterate.
   */
  resolve(imdbId: string | null | undefined, tmdbId: number | null | undefined): EmbedProvider[] {
    const normalizedImdb = imdbId?.trim() || null;
    const normalizedTmdb = tmdbId ?? null;

    if (!normalizedImdb && !normalizedTmdb) return [];

    const results: EmbedProvider[] = [];
    for (const template of PROVIDER_TEMPLATES) {
      const url = template.buildUrl(normalizedImdb, normalizedTmdb);
      if (url) {
        results.push({
          id: template.id,
          name: template.name,
          url,
          supportsProgressEvents: template.supportsProgressEvents,
        });
      }
    }
    return results;
  }
}
