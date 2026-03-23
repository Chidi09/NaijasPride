// apps/api/src/modules/anime/embed-provider.ts
// Fallback provider that returns iframe-embeddable sources from free embed APIs.
// These APIs accept TMDB IDs, so we map AniList → TMDB TV ID first.
// Resolution chain: Redis cache → AniList GraphQL (MAL ID) → TMDB search.
// Mappings are persisted in Redis (permanent) so each AniList ID is resolved once.

import type { ProviderSource } from './anime-provider-manager';
import { getRedis } from '../../shared/services/redis.service';

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.TMDB_KEY || '';
const REDIS_PREFIX = 'anilist-tmdb:';

// ── In-memory fallback cache (used when Redis is unavailable) ───────────────
const memCache = new Map<number, { tmdbId: number | null; season: number }>();

// ── Season suffix patterns to strip for TMDB search ────────────────────────
const SEASON_PATTERNS = [
  /\s*(?:Season|Part)\s*\d+\s*$/i,
  /\s*\d+(?:st|nd|rd|th)\s+Season\s*$/i,
  /\s*(?:II|III|IV|V|VI)$/,
  /\s*(?:2nd|3rd|4th|5th)\s+(?:Season|Part|Cour)\s*$/i,
  /\s*:\s*(?:Season|Part)\s*\d+\s*$/i,
  /\s*S\d+\s*$/i,
];

function stripSeasonSuffix(title: string): string {
  let cleaned = title;
  for (const pattern of SEASON_PATTERNS) {
    cleaned = cleaned.replace(pattern, '').trim();
  }
  return cleaned;
}

/**
 * Detect what TMDB season number this AniList entry corresponds to.
 * AniList treats each season as a separate entry; TMDB has one show with seasons.
 * We parse season number from the title or default to 1.
 */
function detectSeasonNumber(titles: string[]): number {
  for (const title of titles) {
    if (!title) continue;
    // "2nd Season", "3rd Season", etc.
    const ordinalMatch = title.match(/(\d+)(?:st|nd|rd|th)\s+Season/i);
    if (ordinalMatch) return parseInt(ordinalMatch[1]!, 10);
    // "Season 2", "Part 3"
    const seasonMatch = title.match(/(?:Season|Part)\s+(\d+)/i);
    if (seasonMatch) return parseInt(seasonMatch[1]!, 10);
    // Roman numerals at end
    const romanMatch = title.match(/\s+(II|III|IV|V|VI)\s*$/);
    if (romanMatch) {
      const roman: Record<string, number> = { II: 2, III: 3, IV: 4, V: 5, VI: 6 };
      return roman[romanMatch[1]!] || 1;
    }
  }
  return 1;
}

/**
 * Query AniList GraphQL to get MAL ID and all title variants for an anime.
 */
async function getAniListMetadata(anilistId: number): Promise<{
  malId: number | null;
  titles: string[];
} | null> {
  try {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          idMal
          title {
            romaji
            english
            native
          }
          synonyms
        }
      }
    `;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id: anilistId } }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        Media?: {
          idMal?: number;
          title?: { romaji?: string; english?: string; native?: string };
          synonyms?: string[];
        };
      };
    };
    const media = json.data?.Media;
    if (!media) return null;

    const titles: string[] = [];
    if (media.title?.english) titles.push(media.title.english);
    if (media.title?.romaji) titles.push(media.title.romaji);
    if (media.synonyms) titles.push(...media.synonyms.filter(Boolean));

    return { malId: media.idMal ?? null, titles };
  } catch {
    return null;
  }
}

/**
 * Search TMDB with a title query, return first TV show match.
 */
async function searchTmdbTv(query: string): Promise<number | null> {
  if (!query?.trim() || !TMDB_API_KEY) return null;
  try {
    const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{ id: number; name: string }>;
    };
    return json.results?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve AniList ID → TMDB ID + season number.
 *
 * Resolution chain:
 * 1. Redis cache (permanent for hits, 6h TTL for misses)
 * 2. In-memory fallback
 * 3. AniList GraphQL → get MAL ID + enriched titles
 * 4. TMDB title search with original titles
 * 5. TMDB title search with season suffixes stripped (key insight:
 *    TMDB stores "Hell's Paradise" as one show, but AniList calls
 *    season 2 "Jigokuraku 2nd Season")
 * 6. TMDB title search with AniList synonyms
 */
async function resolveTmdbIdForAnilist(
  anilistId: number,
  titles: string[],
): Promise<{ tmdbId: number | null; season: number }> {
  const redis = getRedis();

  // 1. Redis lookup
  if (redis) {
    try {
      const cached = await redis.get(`${REDIS_PREFIX}${anilistId}`);
      if (cached !== null) {
        if (cached === 'null') return { tmdbId: null, season: 1 };
        // Format: "tmdbId:season" or just "tmdbId" (legacy)
        const parts = cached.split(':');
        return {
          tmdbId: Number(parts[0]),
          season: parts[1] ? Number(parts[1]) : detectSeasonNumber(titles),
        };
      }
    } catch {
      // Redis unavailable — continue
    }
  }

  // 2. In-memory fallback
  if (memCache.has(anilistId)) {
    return memCache.get(anilistId)!;
  }

  if (!TMDB_API_KEY) {
    console.warn('[EmbedProvider] No TMDB_API_KEY configured — embed fallback disabled');
    return { tmdbId: null, season: 1 };
  }

  // 3. Fetch enriched metadata from AniList
  const anilistMeta = await getAniListMetadata(anilistId);
  const allTitles = anilistMeta?.titles?.length
    ? [...new Set([...titles, ...anilistMeta.titles])]
    : titles;
  const season = detectSeasonNumber(allTitles);

  let tmdbId: number | null = null;

  // 4. Try original title variants first
  for (const title of allTitles.slice(0, 6)) {
    tmdbId = await searchTmdbTv(title);
    if (tmdbId) {
      console.log(`[EmbedProvider] Mapped AniList ${anilistId} "${title}" → TMDB ${tmdbId} (direct match)`);
      break;
    }
  }

  // 5. Strip season suffixes and retry (TMDB has one entry for the whole show)
  if (!tmdbId) {
    const strippedTitles = new Set<string>();
    for (const title of allTitles.slice(0, 6)) {
      if (!title) continue;
      const stripped = stripSeasonSuffix(title);
      if (stripped !== title && stripped.length > 2) {
        strippedTitles.add(stripped);
      }
    }
    for (const stripped of strippedTitles) {
      tmdbId = await searchTmdbTv(stripped);
      if (tmdbId) {
        console.log(`[EmbedProvider] Mapped AniList ${anilistId} "${stripped}" → TMDB ${tmdbId} (stripped season suffix, S${season})`);
        break;
      }
    }
  }

  // Persist in Redis
  const result = { tmdbId, season };
  if (redis) {
    try {
      if (tmdbId) {
        await redis.set(`${REDIS_PREFIX}${anilistId}`, `${tmdbId}:${season}`);
      } else {
        await redis.set(`${REDIS_PREFIX}${anilistId}`, 'null', 'EX', 6 * 3600);
      }
    } catch {
      // Redis write failed — still cache in memory
    }
  }

  memCache.set(anilistId, result);
  return result;
}

// ── Embed source definitions ───────────────────────────────────────────────

interface EmbedDef {
  name: string;
  buildUrl: (tmdbId: number, s: number, e: number, type: 'sub' | 'dub') => string;
}

const EMBED_SOURCES: EmbedDef[] = [
  {
    name: '2Embed',
    buildUrl: (id, s, e) =>
      `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
  {
    name: 'Videasy',
    buildUrl: (id, s, e) =>
      `https://videasy.net/tv/${id}/${s}/${e}`,
  },
  {
    name: 'SmashyStream',
    buildUrl: (id, s, e) =>
      `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    name: 'NontonGo',
    buildUrl: (id, s, e) =>
      `https://www.nontongo.win/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: 'vidsrc.mov',
    buildUrl: (id, s, e) =>
      `https://vidsrc.mov/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: 'MultiEmbed',
    buildUrl: (id, s, e) =>
      `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
];

/**
 * Main entry point — returns embed sources for a given anime.
 *
 * @param titles     Array of AniList title variants (english, romaji, native)
 * @param season     Season number (almost always 1 for anime)
 * @param episode    Episode number
 * @param type       'sub' or 'dub'
 * @param anilistId  Optional AniList ID for Redis-backed caching
 */
export async function getEmbedSources(
  titles: string[],
  season: number,
  episode: number,
  type: 'sub' | 'dub' = 'sub',
  anilistId?: number,
): Promise<{ sources: ProviderSource[]; tmdbId: number | null }> {
  let tmdbId: number | null = null;
  let resolvedSeason = season;

  if (anilistId) {
    // Use the full resolution chain (AniList → TMDB with season detection)
    const result = await resolveTmdbIdForAnilist(anilistId, titles);
    tmdbId = result.tmdbId;
    resolvedSeason = result.season;
  } else {
    // Fallback: search TMDB directly with titles (+ season stripping)
    for (const title of titles.slice(0, 4)) {
      tmdbId = await searchTmdbTv(title);
      if (tmdbId) break;
    }
    if (!tmdbId) {
      for (const title of titles.slice(0, 4)) {
        if (!title) continue;
        const stripped = stripSeasonSuffix(title);
        if (stripped !== title && stripped.length > 2) {
          tmdbId = await searchTmdbTv(stripped);
          if (tmdbId) {
            resolvedSeason = detectSeasonNumber(titles);
            break;
          }
        }
      }
    }
  }

  if (!tmdbId) {
    return { sources: [], tmdbId: null };
  }

  // Build all embed URLs using the resolved season
  const sources: ProviderSource[] = EMBED_SOURCES.map((def) => ({
    url: def.buildUrl(tmdbId!, resolvedSeason, episode, type),
    quality: type === 'dub' ? `${def.name} (Dub)` : def.name,
    isM3U8: false,
    isEmbed: true,
  }));

  console.log(`[EmbedProvider] Built ${sources.length} embed sources for TMDB ${tmdbId} S${resolvedSeason}E${episode} (${type})`);
  return { sources, tmdbId };
}

/**
 * Health check — just verify we have a TMDB key.
 */
export function isEmbedProviderAvailable(): boolean {
  return !!TMDB_API_KEY;
}
