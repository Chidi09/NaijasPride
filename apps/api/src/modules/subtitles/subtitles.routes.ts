import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { z } from "zod";

import { NotFoundError } from "../../shared/errors/app-error";
import {
  animeIdMappings,
  subtitleEpisodeNumbering,
} from "../anime/anime-id-mappings";
import {
  SubtitleService,
  downloadAndConvertSubtitle,
} from "../movies/subtitles.service";
import { JimakuProvider } from "./providers/jimaku.provider";
import { OpenSubtitlesProvider } from "./providers/opensubtitles.provider";
import { WyzieProvider } from "./providers/wyzie.provider";
import {
  DEFAULT_SUBTITLE_LANGUAGES,
  resolveSubtitles,
  type SubtitleProvider,
  type SubtitleQuery,
  type SubtitleResolution,
} from "./subtitle-provider";

const searchQuerySchema = z.object({
  imdbId: z.string().optional(),
  tmdbId: z.coerce.number().int().positive().optional(),
  anilistId: z.coerce.number().int().positive().optional(),
  season: z.coerce.number().int().min(0).optional(),
  episode: z.coerce.number().int().min(0).optional(),
  title: z.string().optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  /** Comma-separated ISO-639-1 codes, most preferred first. */
  languages: z.string().optional(),
  /** Include languages that weren't asked for, ranked last. */
  anyLanguage: z.coerce.boolean().optional(),
});

/**
 * How long a search result stands. Long, because subtitle catalogues barely
 * move for anything but a title released in the last day or two, and because
 * the quota this protects is a daily one.
 */
const SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * A search that found nothing is cached briefly rather than for hours. It is
 * the state most likely to be caused by something transient — a provider
 * rate-limiting, a key not yet configured — and caching it long turns a
 * passing outage into one that outlives the fix.
 */
const EMPTY_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Converted subtitle bodies, kept for a day.
 *
 * This is the cache that matters. Every OpenSubtitles download spends one of
 * a small daily quota, and without this the quota was spent again on every
 * replay, every seek that reloaded the player, and every viewer of the same
 * episode. A subtitle file for a given file id never changes, so serving a
 * stored copy is not a staleness trade at all.
 */
const FILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Entry caps, since these are process-memory maps. Subtitle files are tens of
 * kilobytes, so a few hundred is a handful of megabytes; the eviction is
 * oldest-first rather than least-recently-used because insertion order is
 * what a Map already tracks and the difference does not matter at this size.
 */
const SEARCH_CACHE_MAX_ENTRIES = 500;
const FILE_CACHE_MAX_ENTRIES = 300;

type CacheEntry<T> = { value: T; timestamp: number };

function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs: number,
): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  maxEntries: number,
): void {
  cache.set(key, { value, timestamp: Date.now() });
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function searchCacheKey(query: SubtitleQuery): string {
  return [
    query.imdbId || "",
    query.tmdbId ?? "",
    query.anilistId ?? "",
    query.season ?? "",
    query.episode ?? "",
    query.title || "",
    query.year ?? "",
    query.languages.join("+"),
    query.anyLanguage ? "any" : "strict",
  ].join("|");
}

export const subtitleSearchRoutes = async (
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) => {
  // Order is only a tie-break: the resolver ranks by requested language and
  // then by the providers' own popularity signal, not by position here.
  const providers: SubtitleProvider[] = [
    new OpenSubtitlesProvider(),
    new WyzieProvider(),
    new JimakuProvider(),
  ];
  const openSubtitles = new SubtitleService();

  const searchCache = new Map<string, CacheEntry<SubtitleResolution>>();
  const fileCache = new Map<string, CacheEntry<string>>();

  app.get("/", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const query = searchQuerySchema.parse(request.query);
      const languages = (query.languages || "")
        .split(",")
        .map((lang) => lang.trim().toLowerCase())
        .filter(Boolean);

      let tmdbId = query.tmdbId ?? null;
      let imdbId = query.imdbId ?? null;
      let season = query.season ?? null;
      let episode = query.episode ?? null;
      let mappedFrom: string | null = null;

      // An anime request arrives with an AniList id and nothing else, which
      // only Jimaku accepts. Translating it here is what lets the general,
      // English-carrying providers answer at all.
      if (query.anilistId && !tmdbId && !imdbId) {
        const mapping = await animeIdMappings(query.anilistId);
        tmdbId = mapping.ids.tmdbId;
        imdbId = mapping.ids.imdbId;
        if (tmdbId || imdbId) {
          mappedFrom = "anilist";
          const numbering = subtitleEpisodeNumbering(mapping, episode);
          season = numbering.season;
          episode = numbering.episode;
        }
      }

      const resolverQuery: SubtitleQuery = {
        imdbId,
        tmdbId,
        anilistId: query.anilistId ?? null,
        season,
        episode,
        title: query.title ?? null,
        year: query.year ?? null,
        languages: languages.length ? languages : DEFAULT_SUBTITLE_LANGUAGES,
        anyLanguage: query.anyLanguage === true,
      };

      const cacheKey = searchCacheKey(resolverQuery);
      const cachedEntry = searchCache.get(cacheKey);
      // The TTL depends on what was cached, so it is chosen against the entry
      // rather than fixed per cache.
      const ttl =
        cachedEntry && cachedEntry.value.tracks.length > 0
          ? SEARCH_CACHE_TTL_MS
          : EMPTY_SEARCH_CACHE_TTL_MS;
      let resolution = readCache(searchCache, cacheKey, ttl);

      if (!resolution) {
        resolution = await resolveSubtitles(providers, resolverQuery);
        writeCache(searchCache, cacheKey, resolution, SEARCH_CACHE_MAX_ENTRIES);
      }

      return reply.send({
        success: true,
        data: {
          subtitles: resolution.tracks,
          providersQueried: resolution.providersQueried,
          providersSkipped: resolution.providersSkipped,
          // What the query became after id translation. Without this, an
          // anime request that found nothing gives no way to tell whether
          // the mapping failed or the providers simply had no match.
          resolvedIds: { tmdbId, imdbId, season, episode, mappedFrom },
        },
      });
    },
  });

  // OpenSubtitles files are not directly linkable — turning a file id into a
  // URL needs an authenticated POST against the account's download quota, so
  // it has to happen here rather than in the player. The response is
  // normalised to WebVTT, which every client can render, and cached, because
  // that quota is the scarcest resource in this feature.
  app.get("/opensubtitles/:fileId/download", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { fileId } = request.params as { fileId: string };

      reply.header("Content-Type", "text/vtt");
      reply.header("Content-Disposition", 'inline; filename="subtitle.vtt"');
      // The body is immutable for a given file id, so let the client and any
      // intermediary keep it too rather than asking again on every replay.
      reply.header("Cache-Control", "public, max-age=86400");

      const cached = readCache(fileCache, fileId, FILE_CACHE_TTL_MS);
      if (cached !== null) {
        return reply.send(cached);
      }

      const downloadResult = await openSubtitles.getDownloadLink(fileId);
      if (!downloadResult) {
        throw new NotFoundError("Download link not available");
      }
      const { content } = await downloadAndConvertSubtitle(
        downloadResult.link,
        downloadResult.fileName,
      );
      writeCache(fileCache, fileId, content, FILE_CACHE_MAX_ENTRIES);
      return reply.send(content);
    },
  });
};
