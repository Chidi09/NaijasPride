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

type MovieProviderTemplate = {
  id: string;
  name: string;
  supportsProgressEvents: boolean;
  buildUrl: (imdbId: string | null, tmdbId: number | null) => string | null;
};

type TvProviderTemplate = {
  id: string;
  name: string;
  supportsProgressEvents: boolean;
  buildUrl: (imdbId: string | null, tmdbId: number | null, season: number, episode: number) => string | null;
};

/** Providers ordered by reliability / quality (best first). */
const MOVIE_PROVIDER_TEMPLATES: MovieProviderTemplate[] = [
  {
    id: 'vidking',
    name: 'Vidking',
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId) =>
      tmdbId ? `https://www.vidking.net/embed/movie/${tmdbId}?color=800020&autoPlay=true` : null,
  },
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
    id: 'vidsrc-cc',
    name: 'VidSrc Pro',
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId) => (tmdbId ? `https://vidsrc.cc/v2/embed/movie/${tmdbId}` : null),
  },
  {
    id: 'vidlink',
    name: 'VidLink',
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId) => (tmdbId ? `https://vidlink.pro/movie/${tmdbId}` : null),
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
];

const TV_PROVIDER_TEMPLATES: TvProviderTemplate[] = [
  {
    id: 'vidking',
    name: 'Vidking',
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId, season, episode) =>
      tmdbId
        ? `https://www.vidking.net/embed/tv/${tmdbId}/${season}/${episode}?color=800020&autoPlay=true`
        : null,
  },
  {
    id: 'vidsrc-me',
    name: 'VidSrc',
    supportsProgressEvents: false,
    buildUrl: (imdbId, _tmdbId, season, episode) =>
      imdbId ? `https://vidsrc.me/embed/tv?imdb=${imdbId}&season=${season}&episode=${episode}` : null,
  },
  {
    id: 'vidsrc-xyz',
    name: 'VidSrc 2',
    supportsProgressEvents: false,
    buildUrl: (imdbId, _tmdbId, season, episode) =>
      imdbId ? `https://vidsrc.xyz/embed/tv/${imdbId}/${season}-${episode}` : null,
  },
  {
    id: 'vidsrc-cc',
    name: 'VidSrc Pro',
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId, season, episode) =>
      tmdbId ? `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}` : null,
  },
  {
    id: 'vidlink',
    name: 'VidLink',
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId, season, episode) =>
      tmdbId ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}` : null,
  },
  {
    id: '2embed',
    name: '2Embed',
    supportsProgressEvents: false,
    buildUrl: (imdbId, _tmdbId, season, episode) =>
      imdbId ? `https://www.2embed.cc/embedtv/${imdbId}&s=${season}&e=${episode}` : null,
  },
  {
    id: 'autoembed',
    name: 'AutoEmbed',
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId, season, episode) => {
      if (imdbId) return `https://autoembed.co/tv/imdb/${imdbId}-${season}-${episode}`;
      if (tmdbId) return `https://autoembed.co/tv/tmdb/${tmdbId}-${season}-${episode}`;
      return null;
    },
  },
  {
    id: 'multiembed',
    name: 'SuperEmbed',
    supportsProgressEvents: false,
    buildUrl: (imdbId, _tmdbId, season, episode) =>
      imdbId ? `https://multiembed.mov/directstream.php?video_id=${imdbId}&s=${season}&e=${episode}` : null,
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
    for (const template of MOVIE_PROVIDER_TEMPLATES) {
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

  resolveTv(
    imdbId: string | null | undefined,
    tmdbId: number | null | undefined,
    season: number,
    episode: number,
  ): EmbedProvider[] {
    const normalizedImdb = imdbId?.trim() || null;
    const normalizedTmdb = tmdbId ?? null;

    if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) return [];
    if (!normalizedImdb && !normalizedTmdb) return [];

    const results: EmbedProvider[] = [];
    for (const template of TV_PROVIDER_TEMPLATES) {
      const url = template.buildUrl(normalizedImdb, normalizedTmdb, season, episode);
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
