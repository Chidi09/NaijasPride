import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  NotFoundError,
  ExternalServiceError,
  BadRequestError,
} from "../../shared/errors/app-error";
import { PassThrough } from "node:stream";
import {
  getAnimepaheRuntimeStats,
  resolveAnimepaheEpisodesByTitles,
  resolveAnimepaheWatchByTitles,
} from "./animepahe-resolver";
import { resolveDirectMediaFromEmbed } from "./embed-stream-resolver";
import { extractVideoSources, VideoSource } from "./video-source-extractor";
import {
  createResolutionTrace,
  pushResolutionEvent,
  summarizeResolutionTrace,
  type ResolutionTraceEvent,
} from "./anime-resolution-observability";
import { animeIdMappings } from "./anime-id-mappings";
import {
  searchAniWatch,
  getAniWatchEpisodes,
  getAniWatchSources,
} from "./aniwatch-provider";
import {
  getEpisodesMultiProvider,
  getSourcesMultiProvider,
  getProvidersHealth,
  type ProviderType,
} from "./anime-provider-manager";
import { getEmbedSources, isEmbedProviderAvailable } from "./embed-provider";
import { resolveGoGoAnimeByEpisode } from "./gogoanime-by-provider";
import { RemoteStreamResolverService } from "../movies/remote-stream-resolver.service";

const ANILIST_API_URL = "https://graphql.anilist.co";
const ANILIST_TIMEOUT_MS = 12_000;
const ANIME_BRIDGE_BASE_URLS = (
  process.env.ANIME_BRIDGE_BASE_URLS ||
  process.env.ANIME_BRIDGE_BASE_URL ||
  ""
)
  .split(",")
  .map((entry) => entry.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const ANIME_BRIDGE_DEFAULT_PROVIDER =
  process.env.ANIME_BRIDGE_PROVIDER || "auto";
const ANIME_BRIDGE_TIMEOUT_MS = 15_000;
// Prioritize working providers - gogoanime/zoro are often down
const ANIME_BRIDGE_FALLBACK_PROVIDERS = ["aniwatch", "animepahe"];

const mediaSeasonSchema = z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]);
const mediaFormatSchema = z.enum([
  "TV",
  "TV_SHORT",
  "MOVIE",
  "SPECIAL",
  "OVA",
  "ONA",
  "MUSIC",
]);
const mediaStatusSchema = z.enum([
  "FINISHED",
  "RELEASING",
  "NOT_YET_RELEASED",
  "CANCELLED",
  "HIATUS",
]);
const mediaSortSchema = z.enum([
  "TRENDING_DESC",
  "POPULARITY_DESC",
  "SCORE_DESC",
  "FAVOURITES_DESC",
  "START_DATE_DESC",
  "START_DATE",
  "TITLE_ROMAJI",
  "TITLE_ROMAJI_DESC",
]);
const countryCodeSchema = z.enum(["JP", "KR", "CN", "TW", "US"]);

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
  sort: mediaSortSchema.default("TRENDING_DESC"),
  isAdult: z.coerce.boolean().default(false),
});

const animeByIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const animeEpisodesQuerySchema = z.object({
  provider: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .default(ANIME_BRIDGE_DEFAULT_PROVIDER),
});

const animeWatchParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  episodeNumber: z.coerce.number().int().positive(),
});

const animeWatchQuerySchema = z.object({
  provider: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .default(ANIME_BRIDGE_DEFAULT_PROVIDER),
  server: z.string().trim().min(2).max(64).optional(),
  type: z.enum(["sub", "dub"]).default("sub"),
});

const animeProxyQuerySchema = z.object({
  url: z.string().url(),
  referer: z.string().trim().url().optional(),
});

// Simple in-memory cache with TTL for video sources
const VIDEO_SOURCE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const videoSourceCache = new Map<
  string,
  { sources: VideoSource[]; timestamp: number }
>();

const ANIME_EPISODES_CACHE_TTL_MS = 90 * 1000;
const ANIME_WATCH_CACHE_TTL_MS = 60 * 1000;
const SKIP_TIMES_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const animeEpisodesCache = new Map<
  string,
  { payload: unknown; timestamp: number }
>();
const animeWatchCache = new Map<
  string,
  { payload: unknown; timestamp: number }
>();
const skipTimesCache = new Map<
  string,
  { payload: unknown; timestamp: number }
>();

const STREAMING_THUMBS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const streamingThumbsCache = new Map<
  string,
  { payload: unknown; timestamp: number }
>();

const ANIME_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const animeDetailCache = new Map<
  string,
  { payload: unknown; timestamp: number }
>();

// A day, because this is the most expensive lookup in the module — Kitsu caps
// a page at 20 episodes, so a long-running series costs a mapping request plus
// one request per 20 episodes — and the answer is essentially static.
const KITSU_EPISODE_THUMBS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const kitsuEpisodeThumbsCache = new Map<
  string,
  { payload: unknown; timestamp: number }
>();

// Same reasoning as Kitsu: paged, and filler classifications essentially
// never change once a series has aired.
const JIKAN_FILLER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const jikanFillerCache = new Map<
  string,
  { payload: unknown; timestamp: number }
>();

/**
 * How long an empty answer from a metadata source stands before it is asked
 * again. Deliberately far shorter than the success TTL: "found nothing" is
 * usually transient — a rate limit, an unreachable host — and caching it for
 * a day makes a momentary failure indistinguishable from a broken feature for
 * the rest of that day.
 */
const METADATA_FAILURE_CACHE_TTL_MS = 10 * 60 * 1000;

type TraceOutcome = "success" | "miss" | "error";

type MetadataSourceResult<T> = {
  entries: Map<number, T>;
  outcome: TraceOutcome;
  detail?: string;
};

const ANIME_STREAMING_EPISODES_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      streamingEpisodes {
        title
        thumbnail
      }
    }
  }
`;

const readCachedPayload = (
  cache: Map<string, { payload: unknown; timestamp: number }>,
  key: string,
  ttlMs: number,
): unknown | null => {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > ttlMs) {
    cache.delete(key);
    return null;
  }
  return cached.payload;
};

const writeCachedPayload = (
  cache: Map<string, { payload: unknown; timestamp: number }>,
  key: string,
  payload: unknown,
): void => {
  cache.set(key, { payload, timestamp: Date.now() });
};

function getCachedVideoSources(key: string): VideoSource[] | null {
  const cached = videoSourceCache.get(key);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > VIDEO_SOURCE_CACHE_TTL_MS) {
    videoSourceCache.delete(key);
    return null;
  }

  return cached.sources;
}

function setCachedVideoSources(key: string, sources: VideoSource[]): void {
  videoSourceCache.set(key, { sources, timestamp: Date.now() });
}

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

const ANIME_IDMAL_QUERY = `
query AnimeIdMal($id: Int!) {
  Media(id: $id, type: ANIME) {
    idMal
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

type AniListStreamingEpisode = {
  title?: string | null;
  thumbnail?: string | null;
  url?: string | null;
  site?: string | null;
};

type AniListMediaWithTitle = {
  idMal?: number | null;
  title?: AniListTitle | null;
  synonyms?: string[] | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  seasonYear?: number | null;
  nextAiringEpisode?: { episode?: number | null } | null;
  streamingEpisodes?: AniListStreamingEpisode[] | null;
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

async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANILIST_TIMEOUT_MS);

  try {
    const response = await fetch(ANILIST_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AniList request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as AniListResponse<T>;
    if (payload.errors?.length) {
      throw new Error(
        payload.errors[0]?.message || "AniList returned an error",
      );
    }
    if (!payload.data) {
      throw new Error("AniList returned an empty response");
    }

    return payload.data;
  } finally {
    clearTimeout(timeout);
  }
}

async function bridgeRequest<T>(path: string): Promise<T> {
  const candidates =
    ANIME_BRIDGE_BASE_URLS.length > 0
      ? ANIME_BRIDGE_BASE_URLS
      : ["https://api.consumet.org"];
  let lastError: Error | null = null;

  for (const baseUrl of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ANIME_BRIDGE_TIMEOUT_MS,
    );

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Anime bridge request failed with status ${response.status} (${baseUrl})`,
        );
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
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

  throw lastError || new Error("All anime bridge endpoints failed");
}

const mapEpisodes = (episodes: BridgeInfoEpisode[] = []) =>
  episodes
    .filter(
      (entry) =>
        !!entry?.id &&
        Number.isFinite(entry?.number || 0) &&
        (entry?.number || 0) > 0,
    )
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

async function hianimeEmbedFallback(
  bridgeEpisodeId: string,
): Promise<HianimeFallbackResult> {
  const hianimeEpisodeIds = hianimeEpisodeIdsFromBridgeId(bridgeEpisodeId);
  if (hianimeEpisodeIds.length === 0) return { sources: [], headers: {} };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANIME_BRIDGE_TIMEOUT_MS);

  try {
    for (const hianimeEpisodeId of hianimeEpisodeIds.slice(0, 3)) {
      const serversResponse = await fetch(
        `https://hianimez.to/ajax/v2/episode/servers?episodeId=${encodeURIComponent(hianimeEpisodeId)}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0",
          },
          signal: controller.signal,
        },
      );

      if (!serversResponse.ok) continue;
      const serversPayload = (await serversResponse.json()) as {
        html?: string;
      };
      const html = serversPayload.html || "";

      const serverIds = Array.from(
        new Set(
          Array.from(html.matchAll(/data-id="(\d+)"/g)).map(
            (entry) => entry[1],
          ),
        ),
      );
      if (serverIds.length === 0) continue;

      const sources: HianimeFallbackSource[] = [];
      let preferredReferer: string | null = null;
      for (const serverId of serverIds.slice(0, 4)) {
        const sourceResponse = await fetch(
          `https://hianimez.to/ajax/v2/episode/sources?id=${encodeURIComponent(serverId)}`,
          {
            headers: {
              Accept: "application/json",
              "User-Agent": "Mozilla/5.0",
            },
            signal: controller.signal,
          },
        );
        if (!sourceResponse.ok) continue;

        const payload = (await sourceResponse.json()) as {
          link?: string;
          sources?: Array<{ url: string; quality?: string; isM3U8?: boolean }>;
        };
        if (!payload.link) continue;

        // Check if we have direct sources
        if (payload.sources && payload.sources.length > 0) {
          for (const source of payload.sources) {
            if (source.url) {
              sources.push({
                url: source.url,
                quality: source.quality || `server-${serverId}`,
                isM3U8: source.isM3U8 || source.url.includes(".m3u8"),
                isEmbed: false,
              });
            }
          }
        }

        // Try to extract video sources from embed using Playwright (with timeout)
        if (sources.length === 0) {
          const cacheKey = `${hianimeEpisodeId}-${serverId}`;
          const cachedSources = getCachedVideoSources(cacheKey);

          if (cachedSources && cachedSources.length > 0) {
            for (const src of cachedSources) {
              sources.push({
                url: src.url,
                quality: src.quality,
                isM3U8: src.isM3U8,
                isEmbed: false,
              });
            }
          } else {
            // Try extraction with a 15-second timeout so the user gets a native player
            try {
              const extractedSources = await Promise.race([
                extractVideoSources(payload.link),
                new Promise<VideoSource[]>((_, reject) =>
                  setTimeout(
                    () => reject(new Error("Extraction timeout")),
                    15000,
                  ),
                ),
              ]);

              if (extractedSources && extractedSources.length > 0) {
                setCachedVideoSources(cacheKey, extractedSources);
                for (const src of extractedSources) {
                  sources.push({
                    url: src.url,
                    quality: src.quality,
                    isM3U8: src.isM3U8,
                    isEmbed: false,
                  });
                }
              } else {
                throw new Error("Empty extraction");
              }
            } catch (error) {
              // Extraction failed or timed out, fallback to iframe embed
              sources.push({
                url: payload.link,
                quality: `embed-${serverId}`,
                isM3U8: false,
                isEmbed: true,
              });
            }
          }
        }

        if (!preferredReferer) {
          preferredReferer = payload.link;
        }
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

const hianimeSearchAnimeIdsByTitles = async (
  titles: string[],
): Promise<string[]> => {
  const ids = new Set<string>();

  for (const title of titles.slice(0, 4)) {
    const query = title.trim();
    if (!query) continue;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ANIME_BRIDGE_TIMEOUT_MS,
    );
    try {
      const response = await fetch(
        `https://hianimez.to/ajax/search/suggest?keyword=${encodeURIComponent(query)}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0",
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) continue;
      const payload = (await response.json()) as { html?: string };
      const html = payload.html || "";
      for (const id of extractHianimeAnimeIdsFromSuggestHtml(html).slice(
        0,
        5,
      )) {
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
  const match = tag.match(new RegExp(`${name}="([^"]+)"`, "i"));
  return match?.[1] || null;
};

const hianimeEpisodeIdByAnimeIdAndNumber = async (
  animeId: string,
  episodeNumber: number,
): Promise<string | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANIME_BRIDGE_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://hianime.to/ajax/v2/episode/list/${encodeURIComponent(animeId)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as { html?: string };
    const html = payload.html || "";
    for (const tagMatch of html.matchAll(/<a\b[^>]*>/gi)) {
      const tag = tagMatch[0] || "";
      const numberAttr = extractAttr(tag, "data-number");
      const idAttr = extractAttr(tag, "data-id");
      const number = Number(numberAttr || 0);
      if (
        idAttr &&
        Number.isFinite(number) &&
        Math.floor(number) === episodeNumber
      ) {
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

const hianimeEmbedFallbackByTitles = async (
  titles: string[],
  episodeNumber: number,
): Promise<HianimeFallbackResult> => {
  const animeIds = await hianimeSearchAnimeIdsByTitles(titles);
  for (const animeId of animeIds.slice(0, 6)) {
    const episodeId = await hianimeEpisodeIdByAnimeIdAndNumber(
      animeId,
      episodeNumber,
    );
    if (!episodeId) continue;

    const result = await hianimeEmbedFallback(episodeId);
    if (result.sources.length > 0) return result;
  }

  return { sources: [], headers: {} };
};

const providersForRequest = (provider: string): string[] => {
  const normalized = provider.trim().toLowerCase();
  // Aniwatch is now the primary working provider
  if (!normalized || normalized === "auto") {
    return ["aniwatch", ...ANIME_BRIDGE_FALLBACK_PROVIDERS];
  }
  // If specific provider requested, try it first then fall back to aniwatch
  if (normalized !== "aniwatch") {
    return [
      normalized,
      "aniwatch",
      ...ANIME_BRIDGE_FALLBACK_PROVIDERS.filter(
        (entry) => entry !== normalized && entry !== "aniwatch",
      ),
    ];
  }
  return [
    normalized,
    ...ANIME_BRIDGE_FALLBACK_PROVIDERS.filter((entry) => entry !== normalized),
  ];
};

const shouldTryAnimepahePrimary = (provider: string): boolean => {
  // Disabled: animepahe uses Playwright which causes timeouts
  // Only enable if explicitly requested with provider=animepahe
  const normalized = provider.trim().toLowerCase();
  return normalized === "animepahe";
};

const isPrivateHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local")
  )
    return true;
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

const rewritePlaylist = (
  playlist: string,
  playlistUrl: URL,
  referer: string,
): string => {
  const lines = playlist.split("\n");
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
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
    .join("\n");
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

async function anilistMediaDetail(
  id: number,
): Promise<AniListMediaWithTitle | null> {
  const cacheKey = String(id);
  const cached = readCachedPayload(
    animeDetailCache,
    cacheKey,
    ANIME_DETAIL_CACHE_TTL_MS,
  ) as AniListMediaWithTitle | null;
  if (cached) return cached;

  const data = await anilistRequest<{ Media: AniListMediaWithTitle | null }>(
    ANIME_DETAIL_QUERY,
    { id },
  );
  const media = data.Media ?? null;
  if (media) {
    writeCachedPayload(animeDetailCache, cacheKey, media);
  }
  return media;
}

const anilistTitlesForAnime = async (
  id: number,
): Promise<{ titles: string[]; format?: string }> => {
  const media = await anilistMediaDetail(id);
  if (!media) return { titles: [] };

  const values = [
    media.title?.english,
    media.title?.romaji,
    media.title?.native,
    ...(media.synonyms || []),
  ];

  const titles = Array.from(
    new Set(
      values
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
  return { titles, format: media.format || undefined };
};

/**
 * Builds an episode list purely from AniList metadata (episode count +
 * streamingEpisodes thumbnails), for when every bridge provider fails.
 * Episode numbers are parsed from streamingEpisodes titles the same way
 * anilistEpisodeThumbnails does, since AniList doesn't expose a stable
 * per-episode number field on that connection.
 */
function buildMetadataEpisodes(
  media: AniListMediaWithTitle,
): ReturnType<typeof mapEpisodes> {
  let total = media.episodes ?? 0;
  if (!total) {
    const nextAiring = media.nextAiringEpisode?.episode;
    if (nextAiring && nextAiring > 1) {
      total = nextAiring - 1;
    } else if (media.status !== "NOT_YET_RELEASED") {
      total = 1;
    }
  }
  if (!total || total <= 0) return [];

  const thumbsByNumber = new Map<number, string>();
  for (const entry of media.streamingEpisodes || []) {
    if (!entry.thumbnail || !entry.title) continue;
    const match = entry.title.match(/epis?ode\s*(\d+)/i);
    const num = match ? Number(match[1]) : null;
    if (num && !thumbsByNumber.has(num)) {
      thumbsByNumber.set(num, entry.thumbnail);
    }
  }

  return Array.from({ length: total }).map((_, index) => {
    const number = index + 1;
    return {
      id: `meta-${number}`,
      number,
      title: null,
      image: thumbsByNumber.get(number) ?? null,
      url: null,
      isFiller: false,
    };
  });
}

async function anilistEpisodeThumbnails(
  anilistId: number,
): Promise<Map<number, string>> {
  const cacheKey = String(anilistId);
  const cached = readCachedPayload(
    streamingThumbsCache,
    cacheKey,
    STREAMING_THUMBS_CACHE_TTL_MS,
  ) as Array<[number, string]> | null;
  if (cached) return new Map(cached);

  const result = new Map<number, string>();
  try {
    const data = await anilistRequest<{
      Media: {
        streamingEpisodes?: Array<{
          title?: string | null;
          thumbnail?: string | null;
        }> | null;
      } | null;
    }>(ANIME_STREAMING_EPISODES_QUERY, { id: anilistId });
    const entries = data.Media?.streamingEpisodes || [];
    for (const entry of entries) {
      if (!entry.thumbnail || !entry.title) continue;
      const match = entry.title.match(/epis?ode\s*(\d+)/i);
      const num = match ? Number(match[1]) : null;
      if (num && !result.has(num)) {
        result.set(num, entry.thumbnail);
      }
    }
  } catch {
    // best-effort — leave result empty on failure
  }

  writeCachedPayload(
    streamingThumbsCache,
    cacheKey,
    Array.from(result.entries()),
  );
  return result;
}

const KITSU_API_BASE = "https://kitsu.io/api/edge";

/** Kitsu rejects anything above this with "Limit exceeds maximum page size". */
const KITSU_PAGE_SIZE = 20;

/** Guards a runaway paginate on an implausible episode count. */
const KITSU_MAX_EPISODES = 2000;

/** Pages in flight at once, to stay a polite client of a free, unkeyed API. */
const KITSU_PAGE_CONCURRENCY = 5;

/**
 * Per-request budget for the metadata sources. They are enrichment: an
 * episode list is still useful without a thumbnail, and is not worth making
 * the caller wait on a source that has stopped answering.
 */
const EPISODE_METADATA_TIMEOUT_MS = 8000;

/**
 * A JSON GET against an external metadata API.
 *
 * The User-Agent is not decoration. Every other outbound call in this module
 * sends one, and the two that did not — Kitsu and Jikan — were the two
 * returning nothing in production while the rest worked: both sit behind
 * edges that treat an unidentified client from a datacentre address as
 * something to refuse. The timeout is here for the same reason the failure is
 * now reported rather than swallowed: a source that hangs used to add its full
 * wait to every episode-list request with nothing to show for it.
 */
async function metadataJson<T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ data: T | null; detail?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    EPISODE_METADATA_TIMEOUT_MS,
  );
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", ...headers },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { data: null, detail: `HTTP ${response.status}` };
    }
    return { data: (await response.json()) as T };
  } catch (error) {
    return {
      data: null,
      detail: error instanceof Error ? error.message : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function kitsuJson<T>(
  path: string,
): Promise<{ data: T | null; detail?: string }> {
  return metadataJson<T>(`${KITSU_API_BASE}${path}`, {
    Accept: "application/vnd.api+json",
  });
}

type KitsuMappingResponse = {
  data?: Array<{
    relationships?: { item?: { data?: { id?: string; type?: string } } };
  }>;
};

type KitsuEpisodesResponse = {
  data?: Array<{
    attributes?: {
      number?: number | null;
      canonicalTitle?: string | null;
      thumbnail?: { original?: string | null } | null;
    };
  }>;
  meta?: { count?: number };
};

type KitsuEpisodeMeta = { image: string | null; title: string | null };

/**
 * Resolves an AniList id to a Kitsu anime id through Kitsu's own mapping
 * table, rather than by searching titles.
 *
 * This is what makes the fallback safe. Anime numbering is a minefield —
 * databases disagree constantly about whether a second cour is a new entry
 * restarting at episode 1 or a continuation of an absolute count — so a
 * title-matched fallback can attach a confidently wrong image to every
 * episode. Because Kitsu records the AniList id explicitly, the entry
 * returned here is by construction the same run AniList is describing, and
 * its `number` field is directly comparable.
 */
async function kitsuAnimeIdForAnilist(
  anilistId: number,
): Promise<{ id: string | null; detail?: string }> {
  const params = new URLSearchParams({
    "filter[externalSite]": "anilist/anime",
    "filter[externalId]": String(anilistId),
  });
  const { data, detail } = await kitsuJson<KitsuMappingResponse>(
    `/mappings?${params}`,
  );
  const item = data?.data?.[0]?.relationships?.item?.data;
  if (!item || item.type !== "anime" || !item.id) {
    return { id: null, detail: detail || "no kitsu mapping" };
  }
  return { id: item.id };
}

function kitsuEpisodesPath(kitsuId: string, offset: number): string {
  // A sparse fieldset: without it every episode carries its full synopsis and
  // localised title set, which over ~19 pages is a lot of payload for three
  // fields.
  const params = new URLSearchParams({
    "page[limit]": String(KITSU_PAGE_SIZE),
    "page[offset]": String(offset),
    "fields[episodes]": "number,canonicalTitle,thumbnail",
  });
  return `/anime/${kitsuId}/episodes?${params}`;
}

function collectKitsuEpisodes(
  response: KitsuEpisodesResponse | null,
  into: Map<number, KitsuEpisodeMeta>,
): void {
  for (const entry of response?.data || []) {
    const number = entry.attributes?.number;
    if (typeof number !== "number" || number <= 0) continue;
    if (into.has(number)) continue;
    const image = entry.attributes?.thumbnail?.original || null;
    const title = entry.attributes?.canonicalTitle?.trim() || null;
    if (!image && !title) continue;
    into.set(number, { image, title });
  }
}

/**
 * Per-episode thumbnails and titles from Kitsu, keyed by episode number.
 *
 * AniList is the primary source but only carries whatever streaming sites
 * have been linked against the entry, which for a long-running series is a
 * small prefix of the run: Bleach exposes 20 `streamingEpisodes` against an
 * episode count of 366, so everything from 21 on had no image at all. Kitsu
 * carries the full run — all 366 in that case, every one with a thumbnail —
 * needs no API key, and numbers episodes the way the app already does.
 *
 * Titles come along for free in the same request, and are worth taking:
 * AniList labels even the episodes it does cover "Episode 20 - Untitled",
 * where Kitsu has the real one.
 */
async function kitsuEpisodeMetadata(
  anilistId: number,
): Promise<MetadataSourceResult<KitsuEpisodeMeta>> {
  const cacheKey = String(anilistId);
  const cached = readCachedPayload(
    kitsuEpisodeThumbsCache,
    cacheKey,
    // A hit that found nothing expires in minutes, not a day. Caching a
    // failure for 24 hours is how a brief upstream outage turned into a full
    // day of thumbnail-less episode lists that looked like a broken feature.
    (kitsuEpisodeThumbsCache.get(cacheKey)?.payload as unknown[] | undefined)
      ?.length
      ? KITSU_EPISODE_THUMBS_CACHE_TTL_MS
      : METADATA_FAILURE_CACHE_TTL_MS,
  ) as Array<[number, KitsuEpisodeMeta]> | null;
  if (cached) {
    return {
      entries: new Map(cached),
      outcome: cached.length ? "success" : "miss",
    };
  }

  const result = new Map<number, KitsuEpisodeMeta>();
  let detail: string | undefined;
  try {
    const mapping = await kitsuAnimeIdForAnilist(anilistId);
    if (!mapping.id) {
      writeCachedPayload(kitsuEpisodeThumbsCache, cacheKey, []);
      return { entries: result, outcome: "miss", detail: mapping.detail };
    }

    // The first page doubles as the count probe — `meta.count` is what says
    // how many more pages there are to ask for.
    const first = await kitsuJson<KitsuEpisodesResponse>(
      kitsuEpisodesPath(mapping.id, 0),
    );
    detail = first.detail;
    collectKitsuEpisodes(first.data, result);

    const total = Math.min(first.data?.meta?.count ?? 0, KITSU_MAX_EPISODES);
    const offsets: number[] = [];
    for (
      let offset = KITSU_PAGE_SIZE;
      offset < total;
      offset += KITSU_PAGE_SIZE
    ) {
      offsets.push(offset);
    }

    for (let i = 0; i < offsets.length; i += KITSU_PAGE_CONCURRENCY) {
      const batch = offsets.slice(i, i + KITSU_PAGE_CONCURRENCY);
      const pages = await Promise.all(
        batch.map((offset) =>
          kitsuJson<KitsuEpisodesResponse>(
            kitsuEpisodesPath(mapping.id!, offset),
          ),
        ),
      );
      for (const page of pages) collectKitsuEpisodes(page.data, result);
    }
  } catch (error) {
    detail = error instanceof Error ? error.message : "kitsu request failed";
  }

  writeCachedPayload(
    kitsuEpisodeThumbsCache,
    cacheKey,
    Array.from(result.entries()),
  );
  return {
    entries: result,
    outcome: result.size > 0 ? "success" : detail ? "error" : "miss",
    detail,
  };
}

/** Jikan asks for no more than a few requests a second. */
const JIKAN_MAX_PAGES = 30;

type JikanEpisodesResponse = {
  data?: Array<{ mal_id?: number; filler?: boolean }>;
  pagination?: { has_next_page?: boolean; last_visible_page?: number };
};

/**
 * Episode numbers marked as filler, from Jikan (the MyAnimeList API).
 *
 * The app has rendered a "Filler" badge on episode tiles all along, but the
 * flag behind it only ever came from the streaming bridges — so the moment
 * every bridge was down, which is also when the episode list falls back to
 * metadata, every episode claimed to be canon. Jikan carries the same
 * classification keyed by MAL id, which is already resolved here for AniSkip.
 *
 * The community AnimeFillerList wrapper usually recommended for this
 * (anime-filler-list-api.vercel.app) is dead — its deployment returns 404 —
 * so this reads MyAnimeList's own data instead.
 */
async function jikanFillerEpisodes(
  malId: number,
): Promise<{ filler: Set<number>; outcome: TraceOutcome; detail?: string }> {
  const cacheKey = String(malId);
  const cached = readCachedPayload(
    jikanFillerCache,
    cacheKey,
    JIKAN_FILLER_CACHE_TTL_MS,
  ) as { episodes: number[]; answered: boolean } | null;
  if (cached) {
    return {
      filler: new Set(cached.episodes),
      outcome: cached.answered ? "success" : "miss",
    };
  }

  const filler = new Set<number>();
  // A series with no filler at all is a perfectly normal answer, so an empty
  // set is not evidence of a problem — whether Jikan answered at all is.
  // Without this distinction a failing request cached "no filler" for a day.
  let answered = false;
  let detail: string | undefined;
  try {
    // Sequential on purpose: Jikan rate-limits aggressively, and this runs
    // at most once a day per series.
    for (let page = 1; page <= JIKAN_MAX_PAGES; page += 1) {
      const { data, detail: pageDetail } =
        await metadataJson<JikanEpisodesResponse>(
          `https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`,
          { Accept: "application/json" },
        );
      if (!data) {
        detail = pageDetail;
        break;
      }
      answered = true;
      for (const episode of data.data || []) {
        if (episode.filler && typeof episode.mal_id === "number") {
          filler.add(episode.mal_id);
        }
      }
      if (!data.pagination?.has_next_page) break;
    }
  } catch (error) {
    detail = error instanceof Error ? error.message : "jikan request failed";
  }

  if (answered) {
    writeCachedPayload(jikanFillerCache, cacheKey, {
      episodes: Array.from(filler),
      answered,
    });
  }

  return {
    filler,
    outcome: answered ? "success" : "error",
    detail: answered ? undefined : detail,
  };
}

type EpisodeWithMeta = {
  number: number;
  image: string | null;
  title?: string | null;
  isFiller?: boolean;
};

const isBlank = (value: string | null | undefined): boolean =>
  !value || value.trim().length === 0;

/**
 * Fills in any episode still missing an image or a title — AniList first,
 * then Kitsu — and marks filler episodes from Jikan. Shared by every path
 * that returns an episode list so they cannot drift apart on which sources
 * they consult.
 */
async function fillEpisodeMetadata<T extends EpisodeWithMeta>(
  anilistId: number,
  episodes: T[],
  trace?: ResolutionTraceEvent[],
): Promise<T[]> {
  if (episodes.length === 0) return episodes;

  const needsImage = (list: T[]) => list.some((ep) => !ep.image);
  const needsTitle = (list: T[]) => list.some((ep) => isBlank(ep.title));

  const note = (
    provider: string,
    outcome: TraceOutcome,
    detail?: string,
  ): void => {
    if (!trace) return;
    pushResolutionEvent(trace, {
      stage: "episode-metadata",
      provider,
      outcome,
      detail,
    });
  };

  /** Applies a source's entries without ever overwriting what is already set. */
  const merge = (
    list: T[],
    entries: Map<number, { image: string | null; title: string | null }>,
  ): T[] =>
    list.map((ep) => {
      const meta = entries.get(ep.number);
      if (!meta) return ep;
      const image = ep.image || meta.image;
      const title = isBlank(ep.title) ? meta.title : ep.title;
      if (image === ep.image && title === ep.title) return ep;
      return { ...ep, image, title };
    });

  let filled = episodes;
  if (needsImage(filled)) {
    try {
      const thumbs = await anilistEpisodeThumbnails(anilistId);
      note("anilist", thumbs.size > 0 ? "success" : "miss");
      if (thumbs.size > 0) {
        filled = filled.map((ep) =>
          !ep.image && thumbs.has(ep.number)
            ? { ...ep, image: thumbs.get(ep.number)! }
            : ep,
        );
      }
    } catch (error) {
      note(
        "anilist",
        "error",
        error instanceof Error ? error.message : "thumbnail lookup failed",
      );
    }
  }

  // AniList only carries the episodes streaming sites have been linked
  // against an entry, which for a long run is a small prefix of it — Bleach
  // exposes 20 of 366 — so the gap is the normal case, not the exception.
  if (needsImage(filled) || needsTitle(filled)) {
    const kitsu = await kitsuEpisodeMetadata(anilistId);
    note("kitsu", kitsu.outcome, kitsu.detail);
    if (kitsu.entries.size > 0) filled = merge(filled, kitsu.entries);
  }

  // A second source on a different host, so one of them being unreachable
  // does not leave the list bare. It costs a single request for a whole
  // series and carries titles for the full run even where its images are
  // sparse, which is worth having on its own.
  if (needsImage(filled) || needsTitle(filled)) {
    const mapping = await animeIdMappings(anilistId);
    note("anizip", mapping.outcome, mapping.detail);
    if (mapping.episodes.size > 0) filled = merge(filled, mapping.episodes);
  }

  // Only ever sets the flag, never clears it: where a bridge supplied its own
  // classification that stands, and this just covers what it didn't mark.
  if (filled.some((ep) => !ep.isFiller)) {
    try {
      const media = await anilistMediaDetail(anilistId);
      const malId = media?.idMal;
      if (malId) {
        const { filler, outcome, detail } = await jikanFillerEpisodes(malId);
        note("jikan", outcome, detail);
        if (filler.size > 0) {
          filled = filled.map((ep) =>
            !ep.isFiller && filler.has(ep.number)
              ? { ...ep, isFiller: true }
              : ep,
          );
        }
      } else {
        note("jikan", "miss", "no MAL id on the AniList entry");
      }
    } catch (error) {
      note(
        "jikan",
        "error",
        error instanceof Error ? error.message : "filler lookup failed",
      );
    }
  }

  return filled;
}

export const animeRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const remoteResolver = new RemoteStreamResolverService();

  const logResolutionTrace = (
    request: { log: { info: (payload: unknown, message: string) => void } },
    trace: ResolutionTraceEvent[],
  ) => {
    request.log.info(
      { traceSummary: summarizeResolutionTrace(trace), trace },
      "Anime resolution trace",
    );
  };

  // Health check endpoint for anime providers
  app.get("/health", async (request, reply) => {
    const health = await getProvidersHealth();
    return reply.send({
      success: true,
      data: health,
    });
  });

  app.get(
    "/search",
    {
      schema: {
        querystring: animeSearchQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        const query = request.query;
        const data = await anilistRequest<{ Page: unknown }>(
          SEARCH_ANIME_QUERY,
          {
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
          },
        );

        return reply.send({
          success: true,
          data: data.Page,
        });
      } catch (error) {
        request.log.error({ error }, "AniList anime search failed");
        throw new ExternalServiceError();
      }
    },
  );

  app.get(
    "/proxy/stream",
    {
      schema: {
        querystring: animeProxyQuerySchema,
      },
      config: {
        rateLimit: {
          max: 120,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const { url, referer } = request.query;

      let targetUrl: URL;
      try {
        targetUrl = new URL(url);
      } catch {
        throw new BadRequestError();
      }

      if (
        !["http:", "https:"].includes(targetUrl.protocol) ||
        isPrivateHost(targetUrl.hostname)
      ) {
        throw new BadRequestError();
      }

      const upstreamReferer =
        referer || `${targetUrl.protocol}//${targetUrl.hostname}/`;
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
            Accept: "*/*",
            Referer: upstreamReferer,
            ...(upstreamOrigin ? { Origin: upstreamOrigin } : {}),
            "User-Agent": "Mozilla/5.0",
          },
          signal: controller.signal,
        });

        if (!upstream.ok) {
          return reply.status(upstream.status).send({
            success: false,
            error: {
              code: "UPSTREAM_FAILED",
              message: `Proxy upstream failed with status ${upstream.status}`,
            },
          });
        }

        const contentType = upstream.headers.get("content-type") || "";
        const cacheControl =
          upstream.headers.get("cache-control") || "no-store";
        reply.header("Cache-Control", cacheControl);
        if (contentType) reply.header("Content-Type", contentType);
        reply.header("Access-Control-Allow-Origin", "*");

        if (
          contentType.includes("application/vnd.apple.mpegurl") ||
          contentType.includes("application/x-mpegURL") ||
          targetUrl.pathname.endsWith(".m3u8")
        ) {
          const rawPlaylist = await upstream.text();
          const rewritten = rewritePlaylist(
            rawPlaylist,
            targetUrl,
            upstreamReferer,
          );
          reply.header("Content-Type", "application/vnd.apple.mpegurl");
          return reply.send(rewritten);
        }

        const contentLength = upstream.headers.get("content-length");
        if (contentLength) reply.header("Content-Length", contentLength);

        if (!upstream.body) {
          const buffer = Buffer.from(await upstream.arrayBuffer());
          return reply.send(buffer);
        }

        return reply.send(
          proxyReadableBody(upstream.body as ReadableStream<Uint8Array>),
        );
      } catch (error) {
        request.log.warn(
          { error, target: targetUrl.toString() },
          "Anime stream proxy failed",
        );
        throw new ExternalServiceError();
      } finally {
        clearTimeout(timeout);
      }
    },
  );

  // GET /extract-stream?url=... - Resolve a playable stream URL from an embed page (requires auth)
  app.get(
    "/extract-stream",
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: z.object({ url: z.string().url() }),
      },
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const { url } = request.query as { url: string };
      try {
        const result = await remoteResolver.resolveFromPage(url, {
          provider: "generic",
          timeoutMs: 45000,
        });
        return reply.send({
          success: true,
          data: {
            streamUrl: result.streamUrl,
            kind: result.kind,
            referer: result.referer ?? null,
          },
        });
      } catch (error) {
        return reply.status(422).send({
          success: false,
          error: {
            code: "EXTRACT_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Could not extract a playable stream",
          },
        });
      }
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        params: animeByIdParamsSchema,
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const data = await anilistRequest<{ Media: unknown | null }>(
          ANIME_DETAIL_QUERY,
          { id },
        );

        if (!data.Media) {
          throw new NotFoundError("Anime not found on AniList");
        }

        return {
          success: true,
          data: data.Media,
        };
      } catch (error) {
        if (error instanceof NotFoundError) throw error;
        request.log.error({ error }, "AniList anime detail fetch failed");
        throw new ExternalServiceError("AniList anime detail fetch failed", {
          cause: error,
        });
      }
    },
  );

  app.get(
    "/:id/episodes",
    {
      schema: {
        params: animeByIdParamsSchema,
        querystring: animeEpisodesQuerySchema,
      },
      config: {
        rateLimit: {
          max: 45,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { provider } = request.query;
        const episodesCacheKey = `${id}|${provider}`;
        const cachedEpisodes = readCachedPayload(
          animeEpisodesCache,
          episodesCacheKey,
          ANIME_EPISODES_CACHE_TTL_MS,
        );
        if (cachedEpisodes) {
          return reply.send(cachedEpisodes);
        }
        const resolutionTrace = createResolutionTrace();
        const sendEpisodesSuccess = (payload: unknown) => {
          writeCachedPayload(animeEpisodesCache, episodesCacheKey, payload);
          return reply.send(payload);
        };

        if (shouldTryAnimepahePrimary(provider)) {
          try {
            const { titles } = await anilistTitlesForAnime(id);
            const animepahe = await resolveAnimepaheEpisodesByTitles(titles);
            if (animepahe && animepahe.episodes.length > 0) {
              const animepaheEpisodes = await fillEpisodeMetadata(
                Number(id),
                animepahe.episodes,
                resolutionTrace,
              );
              pushResolutionEvent(resolutionTrace, {
                stage: "animepahe-episodes",
                provider: "animepahe",
                outcome: "success",
              });
              logResolutionTrace(request, resolutionTrace);
              return sendEpisodesSuccess({
                success: true,
                data: {
                  id,
                  provider: "animepahe",
                  requestedProvider: provider,
                  animeTitle: animepahe.animeTitle,
                  episodes: animepaheEpisodes,
                  bridgeAvailable: true,
                  episodeSource: "bridge",
                  message: null,
                  resolutionTrace,
                  resolutionSummary: summarizeResolutionTrace(resolutionTrace),
                  animepaheRuntime: getAnimepaheRuntimeStats(),
                },
              });
            }
            pushResolutionEvent(resolutionTrace, {
              stage: "animepahe-episodes",
              provider: "animepahe",
              outcome: "miss",
              detail: "No animepahe episodes resolved",
            });
            request.log.warn(
              { animeId: id, provider },
              "Animepahe episodes primary miss",
            );
          } catch {
            pushResolutionEvent(resolutionTrace, {
              stage: "animepahe-episodes",
              provider: "animepahe",
              outcome: "error",
              detail: "Animepahe episodes resolver error",
            });
            request.log.warn(
              {
                animeId: id,
                provider,
                animepaheRuntime: getAnimepaheRuntimeStats(),
              },
              "Animepahe episodes primary error",
            );
            // Fall through to bridge providers
          }
        }

        let usedProvider: string | null = null;
        let info: BridgeInfoResponse | null = null;
        let episodes: ReturnType<typeof mapEpisodes> = [];

        for (const candidate of providersForRequest(provider)) {
          try {
            const attempt = await bridgeRequest<BridgeInfoResponse>(
              `/meta/anilist/info/${id}?provider=${encodeURIComponent(candidate)}`,
            );
            const mapped = mapEpisodes(attempt.episodes);
            if (mapped.length > 0) {
              usedProvider = candidate;
              info = attempt;
              episodes = mapped;
              pushResolutionEvent(resolutionTrace, {
                stage: "bridge-episodes",
                provider: candidate,
                outcome: "success",
              });
              break;
            }
            pushResolutionEvent(resolutionTrace, {
              stage: "bridge-episodes",
              provider: candidate,
              outcome: "miss",
              detail: "No bridge episodes from provider",
            });
            if (!info) {
              info = attempt;
            }
          } catch {
            pushResolutionEvent(resolutionTrace, {
              stage: "bridge-episodes",
              provider: candidate,
              outcome: "error",
              detail: "Bridge episodes request failed",
            });
            continue;
          }
        }

        const bridgeAvailable = episodes.length > 0;
        const episodeSource: "bridge" | "metadata" = bridgeAvailable
          ? "bridge"
          : "metadata";

        if (!bridgeAvailable) {
          try {
            const media = await anilistMediaDetail(Number(id));
            if (media) {
              const metaEpisodes = buildMetadataEpisodes(media);
              if (metaEpisodes.length > 0) {
                episodes = metaEpisodes;
              }
            }
          } catch {
            // best-effort — leave episodes empty on failure
          }
        }

        episodes = await fillEpisodeMetadata(
          Number(id),
          episodes,
          resolutionTrace,
        );

        if (!usedProvider) {
          usedProvider = bridgeAvailable
            ? providersForRequest(provider)[0] || "gogoanime"
            : "auto";
        }

        return sendEpisodesSuccess({
          success: true,
          data: {
            id,
            provider: usedProvider,
            requestedProvider: provider,
            animeTitle: info?.title || null,
            episodes,
            bridgeAvailable,
            episodeSource,
            message: bridgeAvailable
              ? null
              : "Streams are not resolved right now. Episode list is shown from AniList metadata.",
            resolutionTrace,
            resolutionSummary: summarizeResolutionTrace(resolutionTrace),
            animepaheRuntime: getAnimepaheRuntimeStats(),
          },
        });
      } catch (error) {
        request.log.error({ error }, "Anime bridge episodes fetch failed");
        throw new ExternalServiceError();
      }
    },
  );

  app.get(
    "/:id/watch/:episodeNumber",
    {
      schema: {
        params: animeWatchParamsSchema,
        querystring: animeWatchQuerySchema,
      },
      config: {
        rateLimit: {
          max: 24,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      try {
        const { id, episodeNumber } = request.params;
        const { provider, server, type } = request.query;
        const watchCacheKey = `${id}|${episodeNumber}|${provider}|${server || ""}|${type}`;
        const cachedWatch = readCachedPayload(
          animeWatchCache,
          watchCacheKey,
          ANIME_WATCH_CACHE_TTL_MS,
        );
        if (cachedWatch) {
          return reply.send(cachedWatch);
        }
        const resolutionTrace = createResolutionTrace();
        const sendWatchSuccess = (payload: unknown) => {
          writeCachedPayload(animeWatchCache, watchCacheKey, payload);
          return reply.send(payload);
        };
        let anilistTitlesCache: string[] | null = null;

        let anilistFormatCache: string | null = null;

        const getAnilistTitles = async (): Promise<{
          titles: string[];
          format?: string;
        }> => {
          if (anilistTitlesCache)
            return {
              titles: anilistTitlesCache,
              format: anilistFormatCache || undefined,
            };
          const data = await anilistTitlesForAnime(id);
          anilistTitlesCache = data.titles;
          anilistFormatCache = data.format || null;
          return data;
        };

        // Try multi-provider system first (embed, gogoanime-by, etc.)
        if (
          provider === "auto" ||
          provider === "nineanime" ||
          provider === "aniwatch"
        ) {
          try {
            const { titles, format } = await getAnilistTitles();
            const result = await getSourcesMultiProvider(
              titles.slice(0, 4),
              episodeNumber,
              {
                preferredProvider:
                  provider === "auto" ? undefined : (provider as ProviderType),
                type: type || "sub",
                anilistId: id,
              },
            );

            if (result.sources && result.sources.length > 0) {
              pushResolutionEvent(resolutionTrace, {
                stage: "multi-provider-watch",
                provider: result.provider,
                outcome: "success",
              });
              logResolutionTrace(request, resolutionTrace);
              return sendWatchSuccess({
                success: true,
                data: {
                  animeId: id,
                  episode: {
                    id: result.episode?.id || `ep-${episodeNumber}`,
                    number: episodeNumber,
                    title: result.episode?.title || null,
                    image: result.episode?.image || null,
                    url: null,
                    isFiller: false,
                  },
                  provider: result.provider,
                  requestedProvider: provider,
                  server: server || null,
                  sources: result.sources.map((s) => ({
                    url: s.url,
                    quality: s.quality,
                    isM3U8: s.isM3U8,
                    isEmbed: s.isEmbed,
                  })),
                  subtitles: result.subtitles || [],
                  headers: result.sources[0]?.referer
                    ? { Referer: result.sources[0].referer }
                    : {},
                  download: null,
                  resolutionTrace,
                  resolutionSummary: summarizeResolutionTrace(resolutionTrace),
                  animepaheRuntime: getAnimepaheRuntimeStats(),
                },
              });
            }

            pushResolutionEvent(resolutionTrace, {
              stage: "multi-provider-watch",
              provider: "multi",
              outcome: "miss",
              detail: "No sources found from any provider",
            });

            // If multi-provider tried embed+gogoanime-by and failed,
            // skip slow bridge providers for 'auto' — they are unreliable
            if (provider === "auto") {
              logResolutionTrace(request, resolutionTrace);
              throw new NotFoundError(
                "No playable sources found. Try switching providers manually.",
                {
                  animeId: id,
                  resolutionTrace,
                  resolutionSummary: summarizeResolutionTrace(resolutionTrace),
                },
              );
            }
          } catch (err) {
            pushResolutionEvent(resolutionTrace, {
              stage: "multi-provider-watch",
              provider: "multi",
              outcome: "error",
              detail:
                err instanceof Error ? err.message : "Multi-provider error",
            });
          }
        }

        if (shouldTryAnimepahePrimary(provider)) {
          try {
            const { titles, format } = await getAnilistTitles();
            const animepahe = await resolveAnimepaheWatchByTitles(
              titles,
              episodeNumber,
            );
            if (animepahe && animepahe.sources.length > 0) {
              pushResolutionEvent(resolutionTrace, {
                stage: "animepahe-watch",
                provider: "animepahe",
                outcome: "success",
              });
              logResolutionTrace(request, resolutionTrace);
              return sendWatchSuccess({
                success: true,
                data: {
                  animeId: id,
                  episode: {
                    id:
                      animepahe.releaseSession ||
                      `animepahe-ep-${episodeNumber}`,
                    number: episodeNumber,
                    title: null,
                    image: null,
                    url: null,
                    isFiller: false,
                  },
                  provider: "animepahe",
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
              stage: "animepahe-watch",
              provider: "animepahe",
              outcome: "miss",
              detail: "No animepahe watch sources resolved",
            });
            request.log.warn(
              { animeId: id, episodeNumber, provider },
              "Animepahe watch primary miss",
            );
          } catch {
            pushResolutionEvent(resolutionTrace, {
              stage: "animepahe-watch",
              provider: "animepahe",
              outcome: "error",
              detail: "Animepahe watch resolver error",
            });
            request.log.warn(
              {
                animeId: id,
                episodeNumber,
                provider,
                animepaheRuntime: getAnimepaheRuntimeStats(),
              },
              "Animepahe watch primary error",
            );
            // Fall through to bridge providers
          }
        }

        // ── Embed provider (iframe-based, TMDB ID) ───────────────────────────
        // When explicitly requested OR as an additional fallback before bridge
        if (provider === "embed" && isEmbedProviderAvailable()) {
          try {
            const { titles, format } = await getAnilistTitles();
            const embedResult = await getEmbedSources(
              titles,
              1,
              episodeNumber,
              type || "sub",
              id,
            );
            if (embedResult.sources.length > 0) {
              pushResolutionEvent(resolutionTrace, {
                stage: "embed-provider",
                provider: "embed",
                outcome: "success",
                detail: `TMDB ${embedResult.tmdbId} → ${embedResult.sources.length} embeds`,
              });

              // EXTRACT M3U8 NATIVELY FOR "PERFECTION"
              // Reverted: Extracting the m3u8 breaks due to hotlink/CORS protections
              // on Vidsrc/2Embed. We fallback to iframe.
              const resolvedSources = embedResult.sources;

              logResolutionTrace(request, resolutionTrace);
              return sendWatchSuccess({
                success: true,
                data: {
                  animeId: id,
                  episode: {
                    id: `embed-tmdb-${embedResult.tmdbId}-${episodeNumber}`,
                    number: episodeNumber,
                    title: null,
                    image: null,
                    url: null,
                    isFiller: false,
                  },
                  provider: "embed",
                  requestedProvider: provider,
                  server: server || null,
                  sources: resolvedSources,
                  subtitles: [],
                  headers: {},
                  download: null,
                  resolutionTrace,
                  resolutionSummary: summarizeResolutionTrace(resolutionTrace),
                  animepaheRuntime: getAnimepaheRuntimeStats(),
                },
              });
            }
            pushResolutionEvent(resolutionTrace, {
              stage: "embed-provider",
              provider: "embed",
              outcome: "miss",
              detail: "No TMDB match found",
            });
          } catch (err) {
            pushResolutionEvent(resolutionTrace, {
              stage: "embed-provider",
              provider: "embed",
              outcome: "error",
              detail:
                err instanceof Error ? err.message : "Embed provider error",
            });
          }
        }

        // ── GoGoAnime.by provider (FlareSolverr scraper) ──────────────────────
        if (provider === "gogoanime-by") {
          try {
            const { titles, format } = await getAnilistTitles();
            const gogoResult = await resolveGoGoAnimeByEpisode(
              titles[0] || String(id),
              episodeNumber,
              type || "sub",
            );
            if (gogoResult.sources.length > 0) {
              pushResolutionEvent(resolutionTrace, {
                stage: "gogoanime-by",
                provider: "gogoanime-by",
                outcome: "success",
                detail: `${gogoResult.sources.length} sources from gogoanime.by`,
              });
              logResolutionTrace(request, resolutionTrace);
              return sendWatchSuccess({
                success: true,
                data: {
                  animeId: id,
                  episode: {
                    id: `gogo-by-${episodeNumber}`,
                    number: episodeNumber,
                    title: null,
                    image: null,
                    url: gogoResult.episodeUrl || null,
                    isFiller: false,
                  },
                  provider: "gogoanime-by",
                  requestedProvider: provider,
                  server: server || null,
                  sources: gogoResult.sources.map((s) => ({
                    url: s.url,
                    quality: s.quality,
                    isM3U8: s.isM3U8,
                    isEmbed: s.isEmbed,
                  })),
                  subtitles: gogoResult.subtitles || [],
                  headers: {},
                  download: null,
                  resolutionTrace,
                  resolutionSummary: summarizeResolutionTrace(resolutionTrace),
                  animepaheRuntime: getAnimepaheRuntimeStats(),
                },
              });
            }
            pushResolutionEvent(resolutionTrace, {
              stage: "gogoanime-by",
              provider: "gogoanime-by",
              outcome: "miss",
              detail: "No sources found",
            });
          } catch (err) {
            pushResolutionEvent(resolutionTrace, {
              stage: "gogoanime-by",
              provider: "gogoanime-by",
              outcome: "error",
              detail: err instanceof Error ? err.message : "GoGoAnime.by error",
            });
          }
        }

        let resolvedProvider: string | null = null;
        let episode: ReturnType<typeof mapEpisodes>[number] | null = null;
        let watch: BridgeWatchResponse | null = null;
        let sources: Array<{
          url: string;
          quality: string;
          isM3U8: boolean;
          isEmbed?: boolean;
        }> = [];
        let fallbackEpisodeId: string | null = null;
        let fallbackEpisodeIdForHianime: string | null = null;

        for (const candidate of providersForRequest(provider)) {
          try {
            const info = await bridgeRequest<BridgeInfoResponse>(
              `/meta/anilist/info/${id}?provider=${encodeURIComponent(candidate)}`,
            );
            const episodes = mapEpisodes(info.episodes);
            if (!fallbackEpisodeIdForHianime) {
              const hianimeCompatible =
                episodes.find(
                  (entry) =>
                    entry.number === episodeNumber &&
                    hianimeEpisodeIdsFromBridgeId(entry.id).length > 0,
                ) ||
                episodes.find(
                  (entry) => hianimeEpisodeIdsFromBridgeId(entry.id).length > 0,
                );
              if (hianimeCompatible) {
                fallbackEpisodeIdForHianime = hianimeCompatible.id;
              }
            }
            const targetEpisode = episodes.find(
              (entry) => entry.number === episodeNumber,
            );
            if (!targetEpisode) {
              pushResolutionEvent(resolutionTrace, {
                stage: "bridge-watch",
                provider: candidate,
                outcome: "miss",
                detail: `Episode ${episodeNumber} not found in provider episode list`,
              });
              continue;
            }
            if (!fallbackEpisodeId) {
              fallbackEpisodeId = targetEpisode.id;
            }
            if (
              !fallbackEpisodeIdForHianime &&
              hianimeEpisodeIdsFromBridgeId(targetEpisode.id).length > 0
            ) {
              fallbackEpisodeIdForHianime = targetEpisode.id;
            }

            const query = new URLSearchParams({ provider: candidate });
            if (server) query.set("server", server);

            const watchAttempt = await bridgeRequest<BridgeWatchResponse>(
              `/meta/anilist/watch/${encodeURIComponent(targetEpisode.id)}?${query.toString()}`,
            );

            const mappedSources: Array<{
              url: string;
              quality: string;
              isM3U8: boolean;
              isEmbed?: boolean;
            }> = [];

            // Direct sources - use as-is
            for (const source of watchAttempt.sources || []) {
              if (source.url) {
                mappedSources.push({
                  url: source.url as string,
                  quality: source.quality || "auto",
                  isM3U8: !!source.isM3U8,
                  isEmbed: false,
                });
              }
            }

            // Skip embed links that can't be resolved quickly
            // Playwright-based resolution is too slow for API requests
            if (mappedSources.length === 0 && watchAttempt.link) {
              pushResolutionEvent(resolutionTrace, {
                stage: "bridge-watch",
                provider: candidate,
                outcome: "miss",
                detail: "Provider returned embed link without direct sources",
              });
              continue;
            }

            if (mappedSources.length === 0) continue;

            resolvedProvider = candidate;
            episode = targetEpisode;
            watch = watchAttempt;
            sources = mappedSources;
            pushResolutionEvent(resolutionTrace, {
              stage: "bridge-watch",
              provider: candidate,
              outcome: "success",
            });
            break;
          } catch {
            pushResolutionEvent(resolutionTrace, {
              stage: "bridge-watch",
              provider: candidate,
              outcome: "error",
              detail: "Bridge watch request failed",
            });
            continue;
          }
        }

        // Try hianime fallback if bridge providers failed
        if (!episode || !watch || !resolvedProvider || sources.length === 0) {
          let fallback: HianimeFallbackResult = { sources: [], headers: {} };
          let fallbackEpisodeRef =
            fallbackEpisodeIdForHianime || fallbackEpisodeId;

          if (fallbackEpisodeIdForHianime) {
            fallback = await hianimeEmbedFallback(fallbackEpisodeIdForHianime);
          }

          if (fallback.sources.length === 0) {
            try {
              const { titles, format } = await getAnilistTitles();
              if (titles.length > 0) {
                fallback = await hianimeEmbedFallbackByTitles(
                  titles,
                  episodeNumber,
                );
                if (fallback.sources.length > 0 && !fallbackEpisodeRef) {
                  fallbackEpisodeRef = `hianime-title-${episodeNumber}`;
                }
              }
            } catch {
              pushResolutionEvent(resolutionTrace, {
                stage: "hianime-title-fallback",
                provider: "hianime",
                outcome: "error",
                detail: "Title-based hianime fallback failed",
              });
            }
          }

          if (fallback.sources.length > 0) {
            pushResolutionEvent(resolutionTrace, {
              stage: "hianime-fallback",
              provider: "hianime",
              outcome: "success",
            });
            logResolutionTrace(request, resolutionTrace);
            return sendWatchSuccess({
              success: true,
              data: {
                animeId: id,
                episode: episode || {
                  id: fallbackEpisodeRef || `hianime-fallback-${episodeNumber}`,
                  number: episodeNumber,
                  title: null,
                  image: null,
                  url: null,
                  isFiller: false,
                },
                provider: "hianime-fallback",
                requestedProvider: provider,
                server: server || null,
                sources: fallback.sources,
                subtitles: [],
                headers: fallback.headers,
                download: null,
                resolutionTrace,
                resolutionSummary: summarizeResolutionTrace(resolutionTrace),
                animepaheRuntime: getAnimepaheRuntimeStats(),
              },
            });
          }

          pushResolutionEvent(resolutionTrace, {
            stage: "hianime-fallback",
            provider: "hianime",
            outcome: "miss",
            detail: "No hianime fallback embeds resolved",
          });
        }

        if (!episode || !watch || !resolvedProvider) {
          // Last-resort: embed provider (iframe fallback before giving up)
          if (provider !== "embed" && isEmbedProviderAvailable()) {
            try {
              const { titles, format } = await getAnilistTitles();
              const embedResult = await getEmbedSources(
                titles,
                1,
                episodeNumber,
                type || "sub",
                id,
              );
              if (embedResult.sources.length > 0) {
                pushResolutionEvent(resolutionTrace, {
                  stage: "embed-last-resort",
                  provider: "embed",
                  outcome: "success",
                  detail: `TMDB ${embedResult.tmdbId} → ${embedResult.sources.length} embeds`,
                });
                logResolutionTrace(request, resolutionTrace);
                return sendWatchSuccess({
                  success: true,
                  data: {
                    animeId: id,
                    episode: episode || {
                      id: `embed-tmdb-${embedResult.tmdbId}-${episodeNumber}`,
                      number: episodeNumber,
                      title: null,
                      image: null,
                      url: null,
                      isFiller: false,
                    },
                    provider: "embed",
                    requestedProvider: provider,
                    server: server || null,
                    sources: embedResult.sources.map((s) => ({
                      url: s.url,
                      quality: s.quality,
                      isM3U8: s.isM3U8,
                      isEmbed: s.isEmbed,
                    })),
                    subtitles: [],
                    headers: {},
                    download: null,
                    resolutionTrace,
                    resolutionSummary:
                      summarizeResolutionTrace(resolutionTrace),
                    animepaheRuntime: getAnimepaheRuntimeStats(),
                  },
                });
              }
            } catch {
              pushResolutionEvent(resolutionTrace, {
                stage: "embed-last-resort",
                provider: "embed",
                outcome: "error",
              });
            }
          }

          logResolutionTrace(request, resolutionTrace);
          throw new NotFoundError(
            `No playable sources found for episode ${episodeNumber}`,
            {
              resolutionTrace,
              resolutionSummary: summarizeResolutionTrace(resolutionTrace),
              animepaheRuntime: getAnimepaheRuntimeStats(),
            },
          );
        }

        logResolutionTrace(request, resolutionTrace);
        return sendWatchSuccess({
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
                lang: subtitle.lang || "Unknown",
              })),
            headers: watch.headers || {},
            download: watch.download || null,
            resolutionTrace,
            resolutionSummary: summarizeResolutionTrace(resolutionTrace),
            animepaheRuntime: getAnimepaheRuntimeStats(),
          },
        });
      } catch (error) {
        request.log.error({ error }, "Anime bridge watch fetch failed");
        throw new ExternalServiceError();
      }
    },
  );

  app.get(
    "/:id/skip-times/:episodeNumber",
    {
      schema: {
        params: animeWatchParamsSchema,
      },
    },
    async (request, reply) => {
      const { id, episodeNumber } = request.params;
      const cacheKey = `${id}:${episodeNumber}`;

      const cached = readCachedPayload(
        skipTimesCache,
        cacheKey,
        SKIP_TIMES_CACHE_TTL_MS,
      );
      if (cached) {
        return { success: true, data: cached };
      }

      try {
        const idMalData = await anilistRequest<{
          Media: { idMal: number | null } | null;
        }>(ANIME_IDMAL_QUERY, { id });
        const malId = idMalData.Media?.idMal;

        if (!malId) {
          const empty = { op: null, ed: null };
          writeCachedPayload(skipTimesCache, cacheKey, empty);
          return { success: true, data: empty };
        }

        const aniskipUrl = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}?types[]=op&types[]=ed&episodeLength=0`;
        const response = await fetch(aniskipUrl);

        if (!response.ok) {
          const empty = { op: null, ed: null };
          writeCachedPayload(skipTimesCache, cacheKey, empty);
          return { success: true, data: empty };
        }

        const json = (await response.json()) as {
          found: boolean;
          results?: Array<{
            interval: { startTime: number; endTime: number };
            skipType: string;
          }>;
        };

        let op: { start: number; end: number } | null = null;
        let ed: { start: number; end: number } | null = null;

        if (json.found && Array.isArray(json.results)) {
          for (const result of json.results) {
            if (result.skipType === "op" && !op) {
              op = {
                start: result.interval.startTime,
                end: result.interval.endTime,
              };
            } else if (result.skipType === "ed" && !ed) {
              ed = {
                start: result.interval.startTime,
                end: result.interval.endTime,
              };
            }
          }
        }

        const payload = { op, ed };
        writeCachedPayload(skipTimesCache, cacheKey, payload);
        return { success: true, data: payload };
      } catch (error) {
        request.log.warn(
          { error },
          "AniSkip lookup failed, returning empty result",
        );
        const empty = { op: null, ed: null };
        return { success: true, data: empty };
      }
    },
  );

  // === Anime Watch Progress ===
  app.post(
    "/progress",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: z.object({
          anilistId: z.number().int().positive(),
          episodeNumber: z.number().int().positive(),
          title: z.string().min(1),
          imageUrl: z.string().optional(),
          progress: z.number().int().min(0),
          duration: z.number().int().min(0),
          status: z
            .enum([
              "WATCHING",
              "PLAN_TO_WATCH",
              "ON_HOLD",
              "COMPLETED",
              "DROPPED",
            ])
            .optional(),
        }),
      },
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const body = request.body as {
        anilistId: number;
        episodeNumber: number;
        title: string;
        imageUrl?: string;
        progress: number;
        duration: number;
        status?: string;
      };

      const autoCompleted =
        body.duration > 0 && body.progress / body.duration >= 0.85;
      const resolvedStatus =
        body.status ?? (autoCompleted ? "COMPLETED" : undefined);

      await fastify.prisma.animeWatchHistory.upsert({
        where: {
          userId_anilistId_episodeNumber: {
            userId,
            anilistId: body.anilistId,
            episodeNumber: body.episodeNumber,
          },
        },
        update: {
          progress: body.progress,
          duration: body.duration,
          title: body.title,
          ...(body.imageUrl ? { imageUrl: body.imageUrl } : {}),
          ...(resolvedStatus ? { status: resolvedStatus as never } : {}),
        },
        create: {
          userId,
          anilistId: body.anilistId,
          episodeNumber: body.episodeNumber,
          title: body.title,
          imageUrl: body.imageUrl || null,
          progress: body.progress,
          duration: body.duration,
          ...(resolvedStatus ? { status: resolvedStatus as never } : {}),
        },
      });

      // Fire-and-forget AniList sync — never blocks or affects this endpoint's response.
      void (async () => {
        try {
          const clientId = process.env.ANILIST_CLIENT_ID;
          const clientSecret = process.env.ANILIST_CLIENT_SECRET;
          if (!clientId || !clientSecret) return;

          const link = await fastify.prisma.aniListAccountLink.findUnique({
            where: { userId },
          });
          if (!link) return;

          const statusMap: Record<string, string> = {
            WATCHING: "CURRENT",
            PLAN_TO_WATCH: "PLANNING",
            ON_HOLD: "PAUSED",
            COMPLETED: "COMPLETED",
            DROPPED: "DROPPED",
          };
          const anilistStatus = resolvedStatus
            ? statusMap[resolvedStatus]
            : undefined;

          await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${link.accessToken}`,
            },
            body: JSON.stringify({
              query: `mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
          SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) { id }
        }`,
              variables: {
                mediaId: body.anilistId,
                progress: body.episodeNumber,
                status: anilistStatus,
              },
            }),
          });
        } catch (error) {
          request.log.warn({ error }, "AniList background sync failed");
        }
      })();

      return reply.send({ success: true, message: "Anime progress saved" });
    },
  );

  app.get(
    "/progress/:anilistId",
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: z.object({ anilistId: z.coerce.number().int().positive() }),
      },
    },
    async (request) => {
      const userId = request.user.userId;
      const { anilistId } = request.params as { anilistId: number };

      const rows = await fastify.prisma.animeWatchHistory.findMany({
        where: { userId, anilistId },
        orderBy: { updatedAt: "desc" },
      });

      return { success: true, data: rows };
    },
  );

  app.get(
    "/history",
    {
      onRequest: [fastify.authenticate],
    },
    async (request) => {
      const userId = request.user.userId;
      const { limit } = request.query as { limit?: string };
      const take = Math.min(50, Math.max(1, parseInt(limit || "10") || 10));

      const rows = await fastify.prisma.animeWatchHistory.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take,
        distinct: ["anilistId"],
      });

      return { success: true, data: rows };
    },
  );

  // === AniList Account Linking ===

  app.post(
    "/anilist-link",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: z.object({
          code: z.string().min(1),
          redirectUri: z.string().url(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const clientId = process.env.ANILIST_CLIENT_ID;
        const clientSecret = process.env.ANILIST_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return reply.status(503).send({
            success: false,
            error: {
              code: "NOT_CONFIGURED",
              message: "AniList sync is not configured on this server.",
            },
          });
        }

        const body = request.body as { code: string; redirectUri: string };

        const tokenResponse = await fetch(
          "https://anilist.co/api/v2/oauth/token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              grant_type: "authorization_code",
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: body.redirectUri,
              code: body.code,
            }),
          },
        );

        if (!tokenResponse.ok) {
          return reply.status(422).send({
            success: false,
            error: {
              code: "OAUTH_EXCHANGE_FAILED",
              message: "Failed to exchange AniList authorization code",
            },
          });
        }

        const tokenJson = (await tokenResponse.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
        };

        const viewerResponse = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${tokenJson.access_token}`,
          },
          body: JSON.stringify({ query: "query { Viewer { id } }" }),
        });

        const viewerJson = (await viewerResponse.json()) as {
          data?: { Viewer?: { id: number } };
        };
        const anilistUserId = viewerJson.data?.Viewer?.id;
        if (!anilistUserId) {
          return reply.status(422).send({
            success: false,
            error: {
              code: "VIEWER_LOOKUP_FAILED",
              message: "Could not resolve AniList account",
            },
          });
        }

        const expiresAt = tokenJson.expires_in
          ? new Date(Date.now() + tokenJson.expires_in * 1000)
          : null;

        await fastify.prisma.aniListAccountLink.upsert({
          where: { userId: request.user.userId },
          update: {
            anilistUserId,
            accessToken: tokenJson.access_token,
            refreshToken: tokenJson.refresh_token ?? null,
            expiresAt,
          },
          create: {
            userId: request.user.userId,
            anilistUserId,
            accessToken: tokenJson.access_token,
            refreshToken: tokenJson.refresh_token ?? null,
            expiresAt,
          },
        });

        return reply.send({ success: true, data: { anilistUserId } });
      } catch (error) {
        request.log.error({ error }, "AniList link failed");
        return reply.status(500).send({
          success: false,
          error: {
            code: "LINK_FAILED",
            message: "Failed to link AniList account",
          },
        });
      }
    },
  );

  app.delete(
    "/anilist-link",
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      await fastify.prisma.aniListAccountLink.deleteMany({
        where: { userId: request.user.userId },
      });
      return reply.send({ success: true, message: "AniList account unlinked" });
    },
  );

  app.get(
    "/anilist-link",
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      const link = await fastify.prisma.aniListAccountLink.findUnique({
        where: { userId: request.user.userId },
        select: { anilistUserId: true, linkedAt: true },
      });
      return reply.send({
        success: true,
        data: link
          ? {
              linked: true,
              anilistUserId: link.anilistUserId,
              linkedAt: link.linkedAt,
            }
          : { linked: false },
      });
    },
  );
};
