/**
 * Cross-database id mappings for an AniList entry, from ani.zip.
 *
 * Anime is identified by AniList id everywhere in this app, but almost every
 * general-purpose service outside the anime world is keyed on TMDB or IMDb.
 * Subtitle search is the case that forced this: a query carrying only an
 * AniList id could reach Jimaku and nothing else, and Jimaku's catalogue is
 * essentially all Japanese, so every anime subtitle request came back
 * Japanese no matter which language was asked for. Translating the id first
 * lets the general providers answer.
 *
 * ani.zip is used rather than title matching because it is an id-to-id table
 * — the same reason Kitsu's mapping endpoint is preferred over its search.
 * Anime numbering disagrees constantly between databases, and a title-matched
 * mapping attaches confidently wrong subtitles to an episode, which is worse
 * than having none.
 *
 * The response also carries per-episode titles and images, which is a useful
 * second source for episode metadata: it is a single request covering a whole
 * series, and it is a different host from Kitsu, so one being unreachable
 * does not take out both.
 */

const ANIZIP_API_URL = "https://api.ani.zip/mappings";

/** One request, so it can be strict without costing much on a slow answer. */
const ANIZIP_TIMEOUT_MS = 8000;

/** Mappings are static once a series exists. */
const MAPPING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A failed or empty lookup is cached only briefly. The previous version of
 * this pattern cached "nothing found" for a full day, which meant a single
 * unreachable moment — a deploy landing while the upstream was rate-limiting,
 * say — left every series without metadata until the next day, and looked
 * exactly like the feature not working at all.
 */
const MAPPING_FAILURE_CACHE_TTL_MS = 10 * 60 * 1000;

export type AnimeIdMappings = {
  malId: number | null;
  kitsuId: number | null;
  tmdbId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  /** ani.zip's own classification: "TV", "MOVIE", "OVA", … */
  type: string | null;
};

export type AnimeEpisodeMeta = {
  title: string | null;
  image: string | null;
  /**
   * Season and episode as the TMDB/TVDB side numbers them, which is not the
   * absolute number the app uses. Only populated for episodes ani.zip has
   * matched to TVDB — a long series is typically matched only in part.
   */
  seasonNumber: number | null;
  episodeNumber: number | null;
};

export type AnimeMappingResult = {
  ids: AnimeIdMappings;
  /** Keyed by absolute episode number, as the app numbers episodes. */
  episodes: Map<number, AnimeEpisodeMeta>;
  /** Why a caller got nothing, for the resolution trace. */
  outcome: "success" | "miss" | "error";
  detail?: string;
};

type AniZipResponse = {
  mappings?: {
    mal_id?: number | null;
    kitsu_id?: number | null;
    themoviedb_id?: string | number | null;
    imdb_id?: string | null;
    thetvdb_id?: number | null;
    type?: string | null;
  };
  episodes?: Record<
    string,
    {
      title?: Record<string, string> | null;
      image?: string | null;
      seasonNumber?: number | null;
      episodeNumber?: number | null;
    }
  >;
};

const EMPTY_IDS: AnimeIdMappings = {
  malId: null,
  kitsuId: null,
  tmdbId: null,
  imdbId: null,
  tvdbId: null,
  type: null,
};

const cache = new Map<
  number,
  { result: AnimeMappingResult; timestamp: number }
>();

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
}

/**
 * Prefers the English title, then the romanised Japanese one that ani.zip
 * labels `x-jat`. Japanese script is deliberately last: it is unreadable to
 * most of this audience, and an untitled episode row reads better than one
 * labelled in a script the viewer can't parse.
 */
function pickTitle(titles: Record<string, string> | null | undefined) {
  if (!titles) return null;
  const candidate = titles.en || titles["x-jat"] || titles.ja || null;
  const trimmed = candidate?.trim();
  return trimmed ? trimmed : null;
}

export function parseAniZipMappings(json: AniZipResponse): AnimeMappingResult {
  const mappings = json.mappings || {};
  const ids: AnimeIdMappings = {
    malId: numberOrNull(mappings.mal_id),
    kitsuId: numberOrNull(mappings.kitsu_id),
    tmdbId: numberOrNull(mappings.themoviedb_id),
    imdbId: mappings.imdb_id?.trim() || null,
    tvdbId: numberOrNull(mappings.thetvdb_id),
    type: mappings.type?.trim() || null,
  };

  const episodes = new Map<number, AnimeEpisodeMeta>();
  for (const [key, entry] of Object.entries(json.episodes || {})) {
    // Specials are keyed "S1", "S2" and have no place in an absolute-numbered
    // episode list — Number() on them is NaN, which this drops.
    const number = Number(key);
    if (!Number.isInteger(number) || number <= 0) continue;
    const title = pickTitle(entry?.title);
    const image = entry?.image?.trim() || null;
    if (!title && !image) continue;
    episodes.set(number, {
      title,
      image,
      seasonNumber: numberOrNull(entry?.seasonNumber),
      episodeNumber: numberOrNull(entry?.episodeNumber),
    });
  }

  const found = episodes.size > 0 || Boolean(ids.tmdbId || ids.imdbId);
  return { ids, episodes, outcome: found ? "success" : "miss" };
}

export async function animeIdMappings(
  anilistId: number,
): Promise<AnimeMappingResult> {
  const cached = cache.get(anilistId);
  if (cached) {
    const ttl =
      cached.result.outcome === "success"
        ? MAPPING_CACHE_TTL_MS
        : MAPPING_FAILURE_CACHE_TTL_MS;
    if (Date.now() - cached.timestamp <= ttl) return cached.result;
    cache.delete(anilistId);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANIZIP_TIMEOUT_MS);
  let result: AnimeMappingResult;
  try {
    const response = await fetch(`${ANIZIP_API_URL}?anilist_id=${anilistId}`, {
      headers: {
        Accept: "application/json",
        // Every other outbound call in this codebase identifies itself; the
        // ones that didn't were the ones silently returning nothing in
        // production.
        "User-Agent": "Mozilla/5.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      result = {
        ids: EMPTY_IDS,
        episodes: new Map(),
        outcome: "error",
        detail: `ani.zip HTTP ${response.status}`,
      };
    } else {
      result = parseAniZipMappings((await response.json()) as AniZipResponse);
    }
  } catch (error) {
    result = {
      ids: EMPTY_IDS,
      episodes: new Map(),
      outcome: "error",
      detail: error instanceof Error ? error.message : "ani.zip request failed",
    };
  } finally {
    clearTimeout(timer);
  }

  cache.set(anilistId, { result, timestamp: Date.now() });
  return result;
}

/**
 * The season and episode to send to a TMDB/IMDb-keyed service for an anime
 * episode the app knows only by absolute number.
 *
 * Where ani.zip has matched the episode to TVDB its numbering is used
 * directly. Otherwise a TV series falls back to season 1 and the absolute
 * number, which is right for the single-season runs that make up most of the
 * catalogue and wrong for a series TVDB splits into cours — the cost of being
 * wrong is a subtitle search that misses, not one that returns the wrong
 * episode's file, because the providers match on the numbers given. A film
 * has no episode at all.
 */
export function subtitleEpisodeNumbering(
  mapping: AnimeMappingResult,
  absoluteEpisode: number | null,
): { season: number | null; episode: number | null } {
  if (absoluteEpisode == null || absoluteEpisode <= 0) {
    return { season: null, episode: null };
  }
  if (mapping.ids.type && mapping.ids.type.toUpperCase() === "MOVIE") {
    return { season: null, episode: null };
  }
  const matched = mapping.episodes.get(absoluteEpisode);
  if (matched?.seasonNumber != null && matched.episodeNumber != null) {
    return { season: matched.seasonNumber, episode: matched.episodeNumber };
  }
  return { season: 1, episode: absoluteEpisode };
}
