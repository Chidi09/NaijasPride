import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PassThrough } from 'node:stream';
import { getAnimepaheRuntimeStats, resolveAnimepaheEpisodesByTitles, resolveAnimepaheWatchByTitles } from './animepahe-resolver';
import { resolveDirectMediaFromEmbed } from './embed-stream-resolver';
import {
  createResolutionTrace,
  pushResolutionEvent,
  summarizeResolutionTrace,
  type ResolutionTraceEvent,
} from './anime-resolution-observability';

const ANILIST_API_URL = 'https://graphql.anilist.co';
const ANILIST_TIMEOUT_MS = 12_000;
const ANIME_BRIDGE_BASE_URLS = (
  process.env.ANIME_BRIDGE_BASE_URLS || process.env.ANIME_BRIDGE_BASE_URL || 'https://api.consumet.org'
)
  .split(',')
  .map((entry) => entry.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const ANIME_BRIDGE_DEFAULT_PROVIDER = process.env.ANIME_BRIDGE_PROVIDER || 'auto';
const ANIME_BRIDGE_TIMEOUT_MS = 15_000;
const ANIME_BRIDGE_FALLBACK_PROVIDERS = ['gogoanime', 'zoro', 'animepahe'];

const mediaSeasonSchema = z.enum(['WINTER', 'SPRING', 'SUMMER', 'FALL']);
const mediaFormatSchema = z.enum(['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC']);
const mediaStatusSchema = z.enum(['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS']);
const mediaSortSchema = z.enum([
  'TRENDING_DESC',
  'POPULARITY_DESC',
  'SCORE_DESC',
  'FAVOURITES_DESC',
  'START_DATE_DESC',
  'START_DATE',
  'TITLE_ROMAJI',
  'TITLE_ROMAJI_DESC',
]);
const countryCodeSchema = z.enum(['JP', 'KR', 'CN', 'TW', 'US']);

const animeSearchQuerySchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(24),
  season: mediaSeasonSchema.optional(),
  seasonYear: z.coerce.number().int().min(1940).max(2100).optional(),
  format: mediaFormatSchema.optional(),
  status: mediaStatusSchema.optional(),
  genre: z.string().trim().min(2).max(50).optional(),
  countryOfOrigin: countryCodeSchema.optional(),
  sort: mediaSortSchema.default('TRENDING_DESC'),
  isAdult: z.coerce.boolean().default(false),
});

const animeByIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const animeEpisodesQuerySchema = z.object({
  provider: z.string().trim().min(2).max(32).default(ANIME_BRIDGE_DEFAULT_PROVIDER),
});

const animeWatchParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  episodeNumber: z.coerce.number().int().positive(),
});

const animeWatchQuerySchema = z.object({
  provider: z.string().trim().min(2).max(32).default(ANIME_BRIDGE_DEFAULT_PROVIDER),
  server: z.string().trim().min(2).max(64).optional(),
});

const animeProxyQuerySchema = z.object({
  url: z.string().url(),
  referer: z.string().trim().url().optional(),
});

const SEARCH_ANIME_QUERY = `
query SearchAnime(
  $page: Int
  $perPage: Int
  $search: String
  $season: MediaSeason
  $seasonYear: Int
  $format: MediaFormat
  $status: MediaStatus
  $genre: String
  $countryOfOrigin: CountryCode
  $sort: [MediaSort]
  $isAdult: Boolean
) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      perPage
      currentPage
      lastPage
      hasNextPage
    }
    media(
      type: ANIME
      search: $search
      season: $season
      seasonYear: $seasonYear
      format: $format
      status: $status
      genre: $genre
      countryOfOrigin: $countryOfOrigin
      sort: $sort
      isAdult: $isAdult
    ) {
      id
      idMal
      title {
        romaji
        english
        native
      }
      description(asHtml: false)
      season
      seasonYear
      format
      status
      episodes
      duration
      averageScore
      popularity
      genres
      coverImage {
        large
        medium
        color
      }
      bannerImage
      studios(isMain: true) {
        nodes {
          name
        }
      }
      nextAiringEpisode {
        episode
        airingAt
      }
    }
  }
}
`;

const ANIME_DETAIL_QUERY = `
query AnimeDetail($id: Int!) {
  Media(id: $id, type: ANIME) {
    id
    idMal
    title {
      romaji
      english
      native
    }
    description(asHtml: false)
    season
    seasonYear
    format
    status
    episodes
    duration
    averageScore
    popularity
    genres
    synonyms
    source
    countryOfOrigin
    hashtag
    siteUrl
    coverImage {
      large
      extraLarge
      color
    }
    bannerImage
    trailer {
      id
      site
      thumbnail
    }
    studios(isMain: true) {
      nodes {
        name
      }
    }
    externalLinks {
      site
      url
      type
      language
      icon
      color
      isDisabled
    }
    streamingEpisodes {
      title
      thumbnail
      url
      site
    }
    nextAiringEpisode {
      episode
      airingAt
      timeUntilAiring
    }
  }
}
`;

type AniListResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type AniListTitle = {
  english?: string | null;
  romaji?: string | null;
  native?: string | null;
};

type AniListMediaWithTitle = {
  title?: AniListTitle | null;
  synonyms?: string[] | null;
};

type BridgeInfoEpisode = {
  id?: string;
  number?: number;
  title?: string;
  image?: string;
  url?: string;
  isFiller?: boolean;
};

type BridgeInfoResponse = {
  id?: string;
  title?: string;
  episodes?: BridgeInfoEpisode[];
};

type BridgeWatchSource = {
  url?: string;
  quality?: string;
  isM3U8?: boolean;
};

type BridgeWatchSubtitle = {
  url?: string;
  lang?: string;
};

type BridgeWatchResponse = {
  headers?: Record<string, string>;
  sources?: BridgeWatchSource[];
  subtitles?: BridgeWatchSubtitle[];
  download?: string;
  link?: string;
};

async function anilistRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANILIST_TIMEOUT_MS);

  try {
    const response = await fetch(ANILIST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AniList request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as AniListResponse<T>;
    if (payload.errors?.length) {
      throw new Error(payload.errors[0]?.message || 'AniList returned an error');
    }
    if (!payload.data) {
      throw new Error('AniList returned an empty response');
    }

    return payload.data;
  } finally {
    clearTimeout(timeout);
  }
}

async function bridgeRequest<T>(path: string): Promise<T> {
  const candidates = ANIME_BRIDGE_BASE_URLS.length > 0 ? ANIME_BRIDGE_BASE_URLS : ['https://api.consumet.org'];
  let lastError: Error | null = null;

  for (const baseUrl of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANIME_BRIDGE_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Anime bridge request failed with status ${response.status} (${baseUrl})`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Anime bridge returned non-JSON response (${baseUrl})`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('All anime bridge endpoints failed');
}

const mapEpisodes = (episodes: BridgeInfoEpisode[] = []) =>
  episodes
    .filter((entry) => !!entry?.id && Number.isFinite(entry?.number || 0) && (entry?.number || 0) > 0)
    .map((entry) => ({
      id: String(entry.id),
      number: Math.floor(Number(entry.number)),
      title: entry.title || null,
      image: entry.image || null,
      url: entry.url || null,
      isFiller: !!entry.isFiller,
    }))
    .sort((a, b) => a.number - b.number);

type HianimeFallbackSource = {
  url: string;
  quality: string;
  isM3U8: boolean;
  isEmbed: boolean;
  referer?: string;
};

type HianimeFallbackResult = {
  sources: HianimeFallbackSource[];
  headers: Record<string, string>;
};

const hianimeEpisodeIdsFromBridgeId = (bridgeEpisodeId: string): string[] => {
  const raw = bridgeEpisodeId.trim();
  if (!raw) return [];

  const candidates = new Set<string>();
  if (/^\d+$/.test(raw)) {
    candidates.add(raw);
  }

  const patterns = [
    /\$episode\$(\d+)/i,
    /[?&]episode(?:Id)?=(\d+)/i,
    /[?&]ep(?:Id)?=(\d+)/i,
    /(?:^|[-_/])episode[-_/]?(\d{3,})/i,
    /(?:^|[-_/])ep[-_/]?(\d{3,})/i,
    /(\d{5,})$/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      candidates.add(match[1]);
    }
  }

  return Array.from(candidates);
};

async function hianimeEmbedFallback(bridgeEpisodeId: string): Promise<HianimeFallbackResult> {
  const hianimeEpisodeIds = hianimeEpisodeIdsFromBridgeId(bridgeEpisodeId);
  if (hianimeEpisodeIds.length === 0) return { sources: [], headers: {} };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANIME_BRIDGE_TIMEOUT_MS);

  try {
    for (const hianimeEpisodeId of hianimeEpisodeIds.slice(0, 3)) {
      const serversResponse = await fetch(
        `https://hianime.to/ajax/v2/episode/servers?episodeId=${encodeURIComponent(hianimeEpisodeId)}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0',
          },
          signal: controller.signal,
        },
      );

      if (!serversResponse.ok) continue;
      const serversPayload = (await serversResponse.json()) as { html?: string };
      const html = serversPayload.html || '';

      const serverIds = Array.from(new Set(Array.from(html.matchAll(/data-id="(\d+)"/g)).map((entry) => entry[1])));
      if (serverIds.length === 0) continue;

      const sources: HianimeFallbackSource[] = [];
      let preferredReferer: string | null = null;
      for (const serverId of serverIds.slice(0, 4)) {
        const sourceResponse = await fetch(
          `https://hianime.to/ajax/v2/episode/sources?id=${encodeURIComponent(serverId)}`,
          {
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Mozilla/5.0',
            },
            signal: controller.signal,
          },
        );
        if (!sourceResponse.ok) continue;

        const payload = (await sourceResponse.json()) as { link?: string };
        if (!payload.link) continue;

        // Skip embed sources - Playwright resolution is too slow for API requests
        // Sources must provide direct URLs to be usable
        continue;
      }

      if (sources.length > 0) {
        return {
          sources,
          headers: preferredReferer ? { Referer: preferredReferer } : {},
        };
      }
    }

    return { sources: [], headers: {} };
  } catch {
    return { sources: [], headers: {} };
  } finally {
    clearTimeout(timeout);
  }
}

const extractHianimeAnimeIdsFromSuggestHtml = (html: string): string[] => {
  const ids = new Set<string>();
  for (const match of html.matchAll(/href="\/[^"/]+-(\d+)"/gi)) {
    if (match[1]) ids.add(match[1]);
  }
  return Array.from(ids);
};

const hianimeSearchAnimeIdsByTitles = async (titles: string[]): Promise<string[]> => {
  const ids = new Set<string>();

  for (const title of titles.slice(0, 4)) {
    const query = title.trim();
    if (!query) continue;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANIME_BRIDGE_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://hianime.to/ajax/search/suggest?keyword=${encodeURIComponent(query)}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0',
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) continue;
      const payload = (await response.json()) as { html?: string };
      const html = payload.html || '';
      for (const id of extractHianimeAnimeIdsFromSuggestHtml(html).slice(0, 5)) {
        ids.add(id);
      }
    } catch {
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  return Array.from(ids);
};

const extractAttr = (tag: string, name: string): string | null => {
  const match = tag.match(new RegExp(`${name}="([^"]+)"`, 'i'));
  return match?.[1] || null;
};

const hianimeEpisodeIdByAnimeIdAndNumber = async (animeId: string, episodeNumber: number): Promise<string | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANIME_BRIDGE_TIMEOUT_MS);
  try {
    const response = await fetch(`https://hianime.to/ajax/v2/episode/list/${encodeURIComponent(animeId)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { html?: string };
    const html = payload.html || '';
    for (const tagMatch of html.matchAll(/<a\b[^>]*>/gi)) {
      const tag = tagMatch[0] || '';
      const numberAttr = extractAttr(tag, 'data-number');
      const idAttr = extractAttr(tag, 'data-id');
      const number = Number(numberAttr || 0);
      if (idAttr && Number.isFinite(number) && Math.floor(number) === episodeNumber) {
        return idAttr;
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const hianimeEmbedFallbackByTitles = async (titles: string[], episodeNumber: number): Promise<HianimeFallbackResult> => {
  const animeIds = await hianimeSearchAnimeIdsByTitles(titles);
  for (const animeId of animeIds.slice(0, 6)) {
    const episodeId = await hianimeEpisodeIdByAnimeIdAndNumber(animeId, episodeNumber);
    if (!episodeId) continue;

    const result = await hianimeEmbedFallback(episodeId);
    if (result.sources.length > 0) return result;
  }

  return { sources: [], headers: {} };
};

const providersForRequest = (provider: string): string[] => {
  const normalized = provider.trim().toLowerCase();
  if (!normalized || normalized === 'auto') {
    return [...ANIME_BRIDGE_FALLBACK_PROVIDERS];
  }
  return [normalized, ...ANIME_BRIDGE_FALLBACK_PROVIDERS.filter((entry) => entry !== normalized)];
};

const shouldTryAnimepahePrimary = (provider: string): boolean => {
  // Disabled: animepahe uses Playwright which causes timeouts
  // Only enable if explicitly requested with provider=animepahe
  const normalized = provider.trim().toLowerCase();
  return normalized === 'animepahe';
};

const isPrivateHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
};

const proxifyUrl = (target: string, referer: string): string => {
  const params = new URLSearchParams({ url: target, referer });
  return `/api/v1/anime/proxy/stream?${params.toString()}`;
};

const rewritePlaylist = (playlist: string, playlistUrl: URL, referer: string): string => {
  const lines = playlist.split('\n');
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_, uri) => {
            try {
              const resolved = new URL(uri, playlistUrl).toString();
              return `URI="${proxifyUrl(resolved, referer)}"`;
            } catch {
              return `URI="${uri}"`;
            }
          });
        }
        return line;
      }

      try {
        const resolved = new URL(trimmed, playlistUrl).toString();
        return proxifyUrl(resolved, referer);
      } catch {
        return line;
      }
    })
    .join('\n');
};

const proxyReadableBody = (body: ReadableStream<Uint8Array>): PassThrough => {
  const stream = new PassThrough();

  void (async () => {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) stream.write(Buffer.from(value));
      }
      stream.end();
    } catch (error) {
      stream.destroy(error as Error);
    } finally {
      reader.releaseLock();
    }
  })();

  return stream;
};

const anilistTitlesForAnime = async (id: number): Promise<string[]> => {
  const data = await anilistRequest<{ Media: AniListMediaWithTitle | null }>(ANIME_DETAIL_QUERY, { id });
  const media = data.Media;
  if (!media) return [];

  const values = [
    media.title?.english,
    media.title?.romaji,
    media.title?.native,
    ...(media.synonyms || []),
  ];

  return Array.from(
    new Set(
      values
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
};

export const animeRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  const logResolutionTrace = (request: { log: { info: (payload: unknown, message: string) => void } }, trace: ResolutionTraceEvent[]) => {
    request.log.info({ traceSummary: summarizeResolutionTrace(trace), trace }, 'Anime resolution trace');
  };

  app.get('/search', {
    schema: {
      querystring: animeSearchQuerySchema,
    },
  }, async (request, reply) => {
    try {
      const query = request.query;
      const data = await anilistRequest<{ Page: unknown }>(SEARCH_ANIME_QUERY, {
        page: query.page,
        perPage: query.perPage,
        search: query.q,
        season: query.season,
        seasonYear: query.seasonYear,
        format: query.format,
        status: query.status,
        genre: query.genre,
        countryOfOrigin: query.countryOfOrigin,
        sort: [query.sort],
        isAdult: query.isAdult,
      });

      return reply.send({
        success: true,
        data: data.Page,
      });
    } catch (error) {
      request.log.error({ error }, 'AniList anime search failed');
      return reply.status(502).send({
        success: false,
        error: {
          code: 'ANILIST_SEARCH_FAILED',
          message: error instanceof Error ? error.message : 'AniList anime search failed',
        },
      });
    }
  });

  app.get('/proxy/stream', {
    schema: {
      querystring: animeProxyQuerySchema,
    },
  }, async (request, reply) => {
    const { url, referer } = request.query;

    let targetUrl: URL;
    try {
      targetUrl = new URL(url);
    } catch {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_URL', message: 'Invalid target URL' } });
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol) || isPrivateHost(targetUrl.hostname)) {
      return reply.status(400).send({ success: false, error: { code: 'DISALLOWED_URL', message: 'Target URL is not allowed' } });
    }

    const upstreamReferer = referer || `${targetUrl.protocol}//${targetUrl.hostname}/`;
    let upstreamOrigin: string | undefined;
    try {
      upstreamOrigin = new URL(upstreamReferer).origin;
    } catch {
      upstreamOrigin = undefined;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const upstream = await fetch(targetUrl.toString(), {
        headers: {
          Accept: '*/*',
          Referer: upstreamReferer,
          ...(upstreamOrigin ? { Origin: upstreamOrigin } : {}),
          'User-Agent': 'Mozilla/5.0',
        },
        signal: controller.signal,
      });

      if (!upstream.ok) {
        return reply.status(upstream.status).send({
          success: false,
          error: {
            code: 'UPSTREAM_FAILED',
            message: `Proxy upstream failed with status ${upstream.status}`,
          },
        });
      }

      const contentType = upstream.headers.get('content-type') || '';
      const cacheControl = upstream.headers.get('cache-control') || 'no-store';
      reply.header('Cache-Control', cacheControl);
      if (contentType) reply.header('Content-Type', contentType);
      reply.header('Access-Control-Allow-Origin', '*');

      if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL') || targetUrl.pathname.endsWith('.m3u8')) {
        const rawPlaylist = await upstream.text();
        const rewritten = rewritePlaylist(rawPlaylist, targetUrl, upstreamReferer);
        reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        return reply.send(rewritten);
      }

      const contentLength = upstream.headers.get('content-length');
      if (contentLength) reply.header('Content-Length', contentLength);

      if (!upstream.body) {
        const buffer = Buffer.from(await upstream.arrayBuffer());
        return reply.send(buffer);
      }

      return reply.send(proxyReadableBody(upstream.body as ReadableStream<Uint8Array>));
    } catch (error) {
      request.log.warn({ error, target: targetUrl.toString() }, 'Anime stream proxy failed');
      return reply.status(502).send({
        success: false,
        error: {
          code: 'PROXY_FAILED',
          message: 'Failed to proxy stream URL',
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.get('/:id', {
    schema: {
      params: animeByIdParamsSchema,
    },
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const data = await anilistRequest<{ Media: unknown | null }>(ANIME_DETAIL_QUERY, { id });

      if (!data.Media) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Anime not found on AniList',
          },
        });
      }

      return reply.send({
        success: true,
        data: data.Media,
      });
    } catch (error) {
      request.log.error({ error }, 'AniList anime detail fetch failed');
      return reply.status(502).send({
        success: false,
        error: {
          code: 'ANILIST_DETAIL_FAILED',
          message: error instanceof Error ? error.message : 'AniList anime detail fetch failed',
        },
      });
    }
  });

  app.get('/:id/episodes', {
    schema: {
      params: animeByIdParamsSchema,
      querystring: animeEpisodesQuerySchema,
    },
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { provider } = request.query;
      const resolutionTrace = createResolutionTrace();

      if (shouldTryAnimepahePrimary(provider)) {
        try {
          const titles = await anilistTitlesForAnime(id);
          const animepahe = await resolveAnimepaheEpisodesByTitles(titles);
          if (animepahe && animepahe.episodes.length > 0) {
            pushResolutionEvent(resolutionTrace, {
              stage: 'animepahe-episodes',
              provider: 'animepahe',
              outcome: 'success',
            });
            logResolutionTrace(request, resolutionTrace);
            return reply.send({
              success: true,
              data: {
                id,
                provider: 'animepahe',
                requestedProvider: provider,
                animeTitle: animepahe.animeTitle,
                episodes: animepahe.episodes,
                bridgeAvailable: true,
                message: null,
                resolutionTrace,
                resolutionSummary: summarizeResolutionTrace(resolutionTrace),
                animepaheRuntime: getAnimepaheRuntimeStats(),
              },
            });
          }
          pushResolutionEvent(resolutionTrace, {
            stage: 'animepahe-episodes',
            provider: 'animepahe',
            outcome: 'miss',
            detail: 'No animepahe episodes resolved',
          });
          request.log.warn({ animeId: id, provider }, 'Animepahe episodes primary miss');
        } catch {
          pushResolutionEvent(resolutionTrace, {
            stage: 'animepahe-episodes',
            provider: 'animepahe',
            outcome: 'error',
            detail: 'Animepahe episodes resolver error',
          });
          request.log.warn({ animeId: id, provider, animepaheRuntime: getAnimepaheRuntimeStats() }, 'Animepahe episodes primary error');
          // Fall through to bridge providers
        }
      }

      let usedProvider: string | null = null;
      let info: BridgeInfoResponse | null = null;
      let episodes: ReturnType<typeof mapEpisodes> = [];

      for (const candidate of providersForRequest(provider)) {
        try {
          const attempt = await bridgeRequest<BridgeInfoResponse>(`/meta/anilist/info/${id}?provider=${encodeURIComponent(candidate)}`);
          const mapped = mapEpisodes(attempt.episodes);
          if (mapped.length > 0) {
            usedProvider = candidate;
            info = attempt;
            episodes = mapped;
            pushResolutionEvent(resolutionTrace, {
              stage: 'bridge-episodes',
              provider: candidate,
              outcome: 'success',
            });
            break;
          }
          pushResolutionEvent(resolutionTrace, {
            stage: 'bridge-episodes',
            provider: candidate,
            outcome: 'miss',
            detail: 'No bridge episodes from provider',
          });
          if (!info) {
            info = attempt;
          }
        } catch {
          pushResolutionEvent(resolutionTrace, {
            stage: 'bridge-episodes',
            provider: candidate,
            outcome: 'error',
            detail: 'Bridge episodes request failed',
          });
          continue;
        }
      }

      const bridgeAvailable = episodes.length > 0;
      if (!usedProvider) {
        usedProvider = bridgeAvailable ? providersForRequest(provider)[0] || 'gogoanime' : 'auto';
      }

      return reply.send({
        success: true,
        data: {
          id,
          provider: usedProvider,
          requestedProvider: provider,
          animeTitle: info?.title || null,
          episodes,
          bridgeAvailable,
          message: bridgeAvailable ? null : 'No stream episodes resolved from bridge providers right now.',
          resolutionTrace,
          resolutionSummary: summarizeResolutionTrace(resolutionTrace),
          animepaheRuntime: getAnimepaheRuntimeStats(),
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Anime bridge episodes fetch failed');
      return reply.status(502).send({
        success: false,
        error: {
          code: 'ANIME_EPISODES_FAILED',
          message: error instanceof Error ? error.message : 'Anime episodes fetch failed',
        },
      });
    }
  });

  app.get('/:id/watch/:episodeNumber', {
    schema: {
      params: animeWatchParamsSchema,
      querystring: animeWatchQuerySchema,
    },
  }, async (request, reply) => {
    try {
      const { id, episodeNumber } = request.params;
      const { provider, server } = request.query;
      const resolutionTrace = createResolutionTrace();
      let anilistTitlesCache: string[] | null = null;

      const getAnilistTitles = async (): Promise<string[]> => {
        if (anilistTitlesCache) return anilistTitlesCache;
        anilistTitlesCache = await anilistTitlesForAnime(id);
        return anilistTitlesCache;
      };

      if (shouldTryAnimepahePrimary(provider)) {
        try {
          const titles = await getAnilistTitles();
          const animepahe = await resolveAnimepaheWatchByTitles(titles, episodeNumber);
          if (animepahe && animepahe.sources.length > 0) {
            pushResolutionEvent(resolutionTrace, {
              stage: 'animepahe-watch',
              provider: 'animepahe',
              outcome: 'success',
            });
            logResolutionTrace(request, resolutionTrace);
            return reply.send({
              success: true,
              data: {
                animeId: id,
                episode: {
                  id: animepahe.releaseSession || `animepahe-ep-${episodeNumber}`,
                  number: episodeNumber,
                  title: null,
                  image: null,
                  url: null,
                  isFiller: false,
                },
                provider: 'animepahe',
                requestedProvider: provider,
                server: server || null,
                sources: animepahe.sources,
                subtitles: [],
                headers: animepahe.headers,
                download: null,
                resolutionTrace,
                resolutionSummary: summarizeResolutionTrace(resolutionTrace),
                animepaheRuntime: getAnimepaheRuntimeStats(),
              },
            });
          }
          pushResolutionEvent(resolutionTrace, {
            stage: 'animepahe-watch',
            provider: 'animepahe',
            outcome: 'miss',
            detail: 'No animepahe watch sources resolved',
          });
          request.log.warn({ animeId: id, episodeNumber, provider }, 'Animepahe watch primary miss');
        } catch {
          pushResolutionEvent(resolutionTrace, {
            stage: 'animepahe-watch',
            provider: 'animepahe',
            outcome: 'error',
            detail: 'Animepahe watch resolver error',
          });
          request.log.warn(
            { animeId: id, episodeNumber, provider, animepaheRuntime: getAnimepaheRuntimeStats() },
            'Animepahe watch primary error',
          );
          // Fall through to bridge providers
        }
      }

      let resolvedProvider: string | null = null;
      let episode: ReturnType<typeof mapEpisodes>[number] | null = null;
      let watch: BridgeWatchResponse | null = null;
      let sources: Array<{ url: string; quality: string; isM3U8: boolean; isEmbed?: boolean }> = [];
      let fallbackEpisodeId: string | null = null;
      let fallbackEpisodeIdForHianime: string | null = null;

      for (const candidate of providersForRequest(provider)) {
        try {
          const info = await bridgeRequest<BridgeInfoResponse>(`/meta/anilist/info/${id}?provider=${encodeURIComponent(candidate)}`);
          const episodes = mapEpisodes(info.episodes);
          if (!fallbackEpisodeIdForHianime) {
            const hianimeCompatible = episodes.find(
              (entry) => entry.number === episodeNumber && hianimeEpisodeIdsFromBridgeId(entry.id).length > 0,
            ) || episodes.find((entry) => hianimeEpisodeIdsFromBridgeId(entry.id).length > 0);
            if (hianimeCompatible) {
              fallbackEpisodeIdForHianime = hianimeCompatible.id;
            }
          }
          const targetEpisode = episodes.find((entry) => entry.number === episodeNumber);
          if (!targetEpisode) {
            pushResolutionEvent(resolutionTrace, {
              stage: 'bridge-watch',
              provider: candidate,
              outcome: 'miss',
              detail: `Episode ${episodeNumber} not found in provider episode list`,
            });
            continue;
          }
          if (!fallbackEpisodeId) {
            fallbackEpisodeId = targetEpisode.id;
          }
          if (!fallbackEpisodeIdForHianime && hianimeEpisodeIdsFromBridgeId(targetEpisode.id).length > 0) {
            fallbackEpisodeIdForHianime = targetEpisode.id;
          }

          const query = new URLSearchParams({ provider: candidate });
          if (server) query.set('server', server);

          const watchAttempt = await bridgeRequest<BridgeWatchResponse>(
            `/meta/anilist/watch/${encodeURIComponent(targetEpisode.id)}?${query.toString()}`,
          );

          const mappedSources: Array<{ url: string; quality: string; isM3U8: boolean; isEmbed?: boolean }> = [];

          // Direct sources - use as-is
          for (const source of watchAttempt.sources || []) {
            if (source.url) {
              mappedSources.push({
                url: source.url as string,
                quality: source.quality || 'auto',
                isM3U8: !!source.isM3U8,
                isEmbed: false,
              });
            }
          }

          // Skip embed links that can't be resolved quickly
          // Playwright-based resolution is too slow for API requests
          if (mappedSources.length === 0 && watchAttempt.link) {
            pushResolutionEvent(resolutionTrace, {
              stage: 'bridge-watch',
              provider: candidate,
              outcome: 'miss',
              detail: 'Provider returned embed link without direct sources',
            });
            continue;
          }

          if (mappedSources.length === 0) continue;

          resolvedProvider = candidate;
          episode = targetEpisode;
          watch = watchAttempt;
          sources = mappedSources;
          pushResolutionEvent(resolutionTrace, {
            stage: 'bridge-watch',
            provider: candidate,
            outcome: 'success',
          });
          break;
        } catch {
          pushResolutionEvent(resolutionTrace, {
            stage: 'bridge-watch',
            provider: candidate,
            outcome: 'error',
            detail: 'Bridge watch request failed',
          });
          continue;
        }
      }

      if (!episode || !watch || !resolvedProvider || sources.length === 0) {
        pushResolutionEvent(resolutionTrace, {
          stage: 'fallback',
          provider: 'none',
          outcome: 'miss',
          detail: 'No hianime fallback embeds resolved',
        });
      }

      if (!episode || !watch || !resolvedProvider) {
        logResolutionTrace(request, resolutionTrace);
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `No playable sources found for episode ${episodeNumber}`,
          },
          data: {
            resolutionTrace,
            resolutionSummary: summarizeResolutionTrace(resolutionTrace),
            animepaheRuntime: getAnimepaheRuntimeStats(),
          },
        });
      }

      logResolutionTrace(request, resolutionTrace);
      return reply.send({
        success: true,
        data: {
          animeId: id,
          episode,
          provider: resolvedProvider,
          requestedProvider: provider,
          server: server || null,
          sources,
          subtitles: (watch.subtitles || [])
            .filter((subtitle) => !!subtitle.url)
            .map((subtitle) => ({
              url: subtitle.url as string,
              lang: subtitle.lang || 'Unknown',
            })),
          headers: watch.headers || {},
          download: watch.download || null,
          resolutionTrace,
          resolutionSummary: summarizeResolutionTrace(resolutionTrace),
          animepaheRuntime: getAnimepaheRuntimeStats(),
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Anime bridge watch fetch failed');
      return reply.status(502).send({
        success: false,
        error: {
          code: 'ANIME_WATCH_FAILED',
          message: error instanceof Error ? error.message : 'Anime watch fetch failed',
        },
      });
    }
  });
};
