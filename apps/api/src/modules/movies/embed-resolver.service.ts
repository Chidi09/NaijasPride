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
  buildUrl: (
    imdbId: string | null,
    tmdbId: number | null,
    season: number,
    episode: number,
  ) => string | null;
};

// Provider order, set by measured reachability from Nigerian mobile/resi
// ASNs (MTN AS37105, Airtel AS36873, Globacom AS37154, MainOne AS37282)
// rather than by how good each provider's documentation is. These carriers
// put subscribers behind CGNAT, so thousands of sessions share a handful of
// public IPv4 addresses — which reads to a WAF as one very busy client and
// drives the Cloudflare/Turnstile challenge rates below:
//
//   1. Vidking  — challenge rate negligible (<2%). Cloudflare edge workers,
//                 TLS parameters that rarely trip Turnstile on CGNAT.
//   2. 2Embed   — moderate (~12%). Delivers manifests consistently; dips
//                 when transit throttles its ad-network sub-domains.
//   3. VidLink  — high (~38%). Tokenised enc-vidlink API verifies clients
//                 strictly, so shared-IP pools get CAPTCHA'd often.
//   4. VidSrc   — severe (>50%), and last as a result. After the vidsrc.to
//                 takedown the operators moved onto .ru/.su, and West
//                 African upstream transit filters or throttles those TLDs,
//                 so failures show up as timeouts and DNS errors.
//
// Videasy stays behind all of them: its stream is not sniffable at all
// (gated/MSE), so it can never reach the native ad-free player, and its own
// hosted UI is ad-unwatchable.
//
// Within VidSrc the endpoint choice matters as much as the ranking.
// vidsrc.xyz is a gateway that JS-redirects to a backend rather than
// serving playback, and gateways are what registrar-level lock orders hit
// first — a locked gateway fails at DNS even while the mirrors are up. So
// vidsrc-embed.su (the active primary playback mirror; R01-SU registrar,
// Cloudflare NS, Let's Encrypt certs) is listed first, vidsrc-embed.ru
// second, and the gateway is kept only as a late fallback. Listing them as
// separate servers is what makes failover automatic: EmbedWebViewScreen
// advances past a host that won't resolve.
//
// Documented URL shapes:
//   Vidking https://www.vidking.net/  — /embed/movie/{tmdb},
//           /embed/tv/{tmdb}/{s}/{e}; params color (hex, no #), autoPlay,
//           nextEpisode, episodeSelector, progress (start seconds).
//   VidSrc  https://vidsrc.tw/api/    — /embed/movie?tmdb=|imdb=,
//           /embed/tv?tmdb=|imdb=&season=&episode=; params autoplay (1|0),
//           autonext (1|0), ds_lang (ISO-639), sub_url, color.
//   2Embed  https://www.2embed.online/ — /embed/movie/{id},
//           /embed/tv/{id}/{s}/{e}, where {id} is a TMDB number or an IMDb
//           tt-prefixed string. Supersedes the 2embed.cc URLs this used to
//           build, which took an IMDb id only and carried season/episode as
//           an "&s=&e=" tail appended after a path segment.
const MOVIE_PROVIDER_TEMPLATES: MovieProviderTemplate[] = [
  {
    id: "vidking",
    name: "Vidking",
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId) =>
      tmdbId
        ? `https://www.vidking.net/embed/movie/${tmdbId}?color=800020&autoPlay=true`
        : null,
  },
  {
    id: "2embed",
    name: "2Embed",
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId) => {
      const id = tmdbId ?? imdbId;
      return id ? `https://www.2embed.online/embed/movie/${id}` : null;
    },
  },
  {
    id: "vidlink",
    name: "VidLink",
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId) =>
      tmdbId ? `https://vidlink.pro/movie/${tmdbId}` : null,
  },
  {
    id: "vidsrc-su",
    name: "VidSrc",
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId) => {
      if (tmdbId)
        return `https://vidsrc-embed.su/embed/movie?tmdb=${tmdbId}&autoplay=1&ds_lang=en`;
      if (imdbId)
        return `https://vidsrc-embed.su/embed/movie?imdb=${imdbId}&autoplay=1&ds_lang=en`;
      return null;
    },
  },
  {
    id: "vidsrc-ru",
    name: "VidSrc Mirror",
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId) => {
      if (tmdbId)
        return `https://vidsrc-embed.ru/embed/movie?tmdb=${tmdbId}&autoplay=1`;
      if (imdbId)
        return `https://vidsrc-embed.ru/embed/movie?imdb=${imdbId}&autoplay=1`;
      return null;
    },
  },
  {
    id: "vidsrc-cc",
    name: "VidSrc Pro",
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId) =>
      tmdbId ? `https://vidsrc.cc/v2/embed/movie/${tmdbId}` : null,
  },
  {
    id: "vidsrc-xyz",
    name: "VidSrc Gateway",
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId) => {
      if (tmdbId)
        return `https://vidsrc.xyz/embed/movie?tmdb=${tmdbId}&autoplay=1&ds_lang=en`;
      if (imdbId)
        return `https://vidsrc.xyz/embed/movie?imdb=${imdbId}&autoplay=1&ds_lang=en`;
      return null;
    },
  },
  {
    id: "autoembed",
    name: "AutoEmbed",
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId) => {
      if (imdbId) return `https://autoembed.co/movie/imdb/${imdbId}`;
      if (tmdbId) return `https://autoembed.co/movie/tmdb/${tmdbId}`;
      return null;
    },
  },
  {
    id: "multiembed",
    name: "SuperEmbed",
    supportsProgressEvents: false,
    buildUrl: (imdbId) =>
      imdbId
        ? `https://multiembed.mov/directstream.php?video_id=${imdbId}`
        : null,
  },
  {
    id: "videasy",
    name: "Videasy",
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId) =>
      tmdbId ? `https://player.videasy.net/movie/${tmdbId}?color=800020` : null,
  },
];

const TV_PROVIDER_TEMPLATES: TvProviderTemplate[] = [
  {
    id: "vidking",
    name: "Vidking",
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId, season, episode) =>
      tmdbId
        ? `https://www.vidking.net/embed/tv/${tmdbId}/${season}/${episode}?color=800020&autoPlay=true&nextEpisode=true&episodeSelector=true`
        : null,
  },
  {
    id: "2embed",
    name: "2Embed",
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId, season, episode) => {
      const id = tmdbId ?? imdbId;
      return id
        ? `https://www.2embed.online/embed/tv/${id}/${season}/${episode}`
        : null;
    },
  },
  {
    id: "vidlink",
    name: "VidLink",
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId, season, episode) =>
      tmdbId ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}` : null,
  },
  {
    id: "vidsrc-su",
    name: "VidSrc",
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId, season, episode) => {
      const tail = `&season=${season}&episode=${episode}&autoplay=1&autonext=1&ds_lang=en`;
      if (tmdbId)
        return `https://vidsrc-embed.su/embed/tv?tmdb=${tmdbId}${tail}`;
      if (imdbId)
        return `https://vidsrc-embed.su/embed/tv?imdb=${imdbId}${tail}`;
      return null;
    },
  },
  {
    id: "vidsrc-ru",
    name: "VidSrc Mirror",
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId, season, episode) => {
      const tail = `&season=${season}&episode=${episode}&autoplay=1&autonext=1`;
      if (tmdbId)
        return `https://vidsrc-embed.ru/embed/tv?tmdb=${tmdbId}${tail}`;
      if (imdbId)
        return `https://vidsrc-embed.ru/embed/tv?imdb=${imdbId}${tail}`;
      return null;
    },
  },
  {
    id: "vidsrc-cc",
    name: "VidSrc Pro",
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId, season, episode) =>
      tmdbId
        ? `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`
        : null,
  },
  {
    id: "vidsrc-xyz",
    name: "VidSrc Gateway",
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId, season, episode) => {
      const tail = `&season=${season}&episode=${episode}&autoplay=1&autonext=1&ds_lang=en`;
      if (tmdbId) return `https://vidsrc.xyz/embed/tv?tmdb=${tmdbId}${tail}`;
      if (imdbId) return `https://vidsrc.xyz/embed/tv?imdb=${imdbId}${tail}`;
      return null;
    },
  },
  {
    id: "autoembed",
    name: "AutoEmbed",
    supportsProgressEvents: false,
    buildUrl: (imdbId, tmdbId, season, episode) => {
      if (imdbId)
        return `https://autoembed.co/tv/imdb/${imdbId}-${season}-${episode}`;
      if (tmdbId)
        return `https://autoembed.co/tv/tmdb/${tmdbId}-${season}-${episode}`;
      return null;
    },
  },
  {
    id: "multiembed",
    name: "SuperEmbed",
    supportsProgressEvents: false,
    buildUrl: (imdbId, _tmdbId, season, episode) =>
      imdbId
        ? `https://multiembed.mov/directstream.php?video_id=${imdbId}&s=${season}&e=${episode}`
        : null,
  },
  {
    id: "videasy",
    name: "Videasy",
    supportsProgressEvents: true,
    buildUrl: (_imdbId, tmdbId, season, episode) =>
      tmdbId
        ? `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}?color=800020&nextEpisode=true&episodeSelector=true`
        : null,
  },
];

export class EmbedResolverService {
  /**
   * Returns all embed providers that can serve this movie.
   * Order is stable (best-first) so the frontend can iterate.
   */
  resolve(
    imdbId: string | null | undefined,
    tmdbId: number | null | undefined,
  ): EmbedProvider[] {
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

    if (
      !Number.isInteger(season) ||
      season < 1 ||
      !Number.isInteger(episode) ||
      episode < 1
    )
      return [];
    if (!normalizedImdb && !normalizedTmdb) return [];

    const results: EmbedProvider[] = [];
    for (const template of TV_PROVIDER_TEMPLATES) {
      const url = template.buildUrl(
        normalizedImdb,
        normalizedTmdb,
        season,
        episode,
      );
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
