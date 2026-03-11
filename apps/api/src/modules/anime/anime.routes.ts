import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { resolveAnimepaheEpisodesByTitles, resolveAnimepaheWatchByTitles } from './animepahe-resolver';

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
};

const hianimeEpisodeIdFromBridgeId = (bridgeEpisodeId: string): string | null => {
  const match = bridgeEpisodeId.match(/\$episode\$(\d+)/);
  return match?.[1] || null;
};

async function hianimeEmbedFallback(bridgeEpisodeId: string): Promise<HianimeFallbackSource[]> {
  const hianimeEpisodeId = hianimeEpisodeIdFromBridgeId(bridgeEpisodeId);
  if (!hianimeEpisodeId) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANIME_BRIDGE_TIMEOUT_MS);

  try {
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

    if (!serversResponse.ok) return [];
    const serversPayload = (await serversResponse.json()) as { html?: string };
    const html = serversPayload.html || '';

    const serverIds = Array.from(new Set(Array.from(html.matchAll(/data-id="(\d+)"/g)).map((entry) => entry[1])));
    if (serverIds.length === 0) return [];

    const sources: HianimeFallbackSource[] = [];
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

      sources.push({
        url: payload.link,
        quality: `embed-${serverId}`,
        isM3U8: false,
        isEmbed: true,
      });
    }

    return sources;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

const providersForRequest = (provider: string): string[] => {
  const normalized = provider.trim().toLowerCase();
  if (!normalized || normalized === 'auto') {
    return [...ANIME_BRIDGE_FALLBACK_PROVIDERS];
  }
  return [normalized, ...ANIME_BRIDGE_FALLBACK_PROVIDERS.filter((entry) => entry !== normalized)];
};

const shouldTryAnimepahePrimary = (provider: string): boolean => {
  const normalized = provider.trim().toLowerCase();
  return !normalized || normalized === 'auto' || normalized === 'animepahe';
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

      if (shouldTryAnimepahePrimary(provider)) {
        try {
          const titles = await anilistTitlesForAnime(id);
          const animepahe = await resolveAnimepaheEpisodesByTitles(titles);
          if (animepahe && animepahe.episodes.length > 0) {
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
              },
            });
          }
        } catch {
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
            break;
          }
          if (!info) {
            info = attempt;
          }
        } catch {
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

      if (shouldTryAnimepahePrimary(provider)) {
        try {
          const titles = await anilistTitlesForAnime(id);
          const animepahe = await resolveAnimepaheWatchByTitles(titles, episodeNumber);
          if (animepahe && animepahe.sources.length > 0) {
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
              },
            });
          }
        } catch {
          // Fall through to bridge providers
        }
      }

      let resolvedProvider: string | null = null;
      let episode: ReturnType<typeof mapEpisodes>[number] | null = null;
      let watch: BridgeWatchResponse | null = null;
      let sources: Array<{ url: string; quality: string; isM3U8: boolean; isEmbed?: boolean }> = [];
      let fallbackEpisodeId: string | null = null;

      for (const candidate of providersForRequest(provider)) {
        try {
          const info = await bridgeRequest<BridgeInfoResponse>(`/meta/anilist/info/${id}?provider=${encodeURIComponent(candidate)}`);
          const episodes = mapEpisodes(info.episodes);
          const targetEpisode = episodes.find((entry) => entry.number === episodeNumber);
          if (!targetEpisode) continue;
          if (!fallbackEpisodeId) {
            fallbackEpisodeId = targetEpisode.id;
          }

          const query = new URLSearchParams({ provider: candidate });
          if (server) query.set('server', server);

          const watchAttempt = await bridgeRequest<BridgeWatchResponse>(
            `/meta/anilist/watch/${encodeURIComponent(targetEpisode.id)}?${query.toString()}`,
          );

          const mappedSources = (watchAttempt.sources || [])
            .filter((source) => !!source.url)
            .map((source) => ({
              url: source.url as string,
              quality: source.quality || 'auto',
              isM3U8: !!source.isM3U8,
              isEmbed: false,
            }));

          if (mappedSources.length === 0 && watchAttempt.link) {
            mappedSources.push({
              url: watchAttempt.link,
              quality: 'embed',
              isM3U8: false,
              isEmbed: true,
            });
          }

          if (mappedSources.length === 0) continue;

          resolvedProvider = candidate;
          episode = targetEpisode;
          watch = watchAttempt;
          sources = mappedSources;
          break;
        } catch {
          continue;
        }
      }

      if ((!episode || !watch || !resolvedProvider || sources.length === 0) && fallbackEpisodeId) {
        const fallbackSources = await hianimeEmbedFallback(fallbackEpisodeId);
        if (fallbackSources.length > 0) {
          return reply.send({
            success: true,
            data: {
              animeId: id,
              episode: episode || { id: fallbackEpisodeId, number: episodeNumber, title: null, image: null, url: null, isFiller: false },
              provider: 'hianime-fallback',
              requestedProvider: provider,
              server: server || null,
              sources: fallbackSources,
              subtitles: [],
              headers: {},
              download: null,
            },
          });
        }
      }

      if (!episode || !watch || !resolvedProvider) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `No playable sources found for episode ${episodeNumber}`,
          },
        });
      }

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
