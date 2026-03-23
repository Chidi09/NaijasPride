// apps/api/src/modules/anime/embed-provider.ts
// Fallback provider that returns iframe-embeddable sources from free embed APIs.
// These APIs accept TMDB IDs, so we map AniList title → TMDB TV ID first.
// Mappings are persisted in Redis (permanent) so each AniList ID is resolved once.

import type { ProviderSource } from './anime-provider-manager';
import { getRedis } from '../../shared/services/redis.service';

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.TMDB_KEY || '';
const REDIS_PREFIX = 'anilist-tmdb:';

// ── In-memory fallback cache (used when Redis is unavailable) ───────────────
const memCache = new Map<number, number | null>();

/**
 * Resolve AniList ID → TMDB ID.
 * 1. Check Redis (permanent, survives restarts)
 * 2. Check in-memory fallback
 * 3. Search TMDB with title variants, store result in Redis
 */
async function resolveTmdbIdForAnilist(
  anilistId: number,
  titles: string[],
): Promise<number | null> {
  // 1. Redis lookup
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(`${REDIS_PREFIX}${anilistId}`);
      if (cached !== null) {
        const id = cached === 'null' ? null : Number(cached);
        return id;
      }
    } catch {
      // Redis unavailable — continue
    }
  }

  // 2. In-memory fallback
  if (memCache.has(anilistId)) {
    return memCache.get(anilistId)!;
  }

  // 3. Search TMDB
  if (!TMDB_API_KEY) {
    console.warn('[EmbedProvider] No TMDB_API_KEY configured — embed fallback disabled');
    return null;
  }

  let tmdbId: number | null = null;

  for (const title of titles.slice(0, 4)) {
    if (!title?.trim()) continue;
    try {
      const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&include_adult=false`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
      if (!res.ok) continue;

      const json = (await res.json()) as {
        results?: Array<{ id: number; name: string; first_air_date?: string }>;
      };
      const match = json.results?.[0];
      if (match?.id) {
        tmdbId = match.id;
        console.log(`[EmbedProvider] Mapped AniList ${anilistId} "${title}" → TMDB ${tmdbId}`);
        break;
      }
    } catch {
      // Title variant failed — try next
    }
  }

  // Persist in Redis (even null results to avoid re-searching)
  if (redis) {
    try {
      // null results expire after 6 hours (anime might get added to TMDB later)
      // positive results are permanent (IDs never change)
      if (tmdbId) {
        await redis.set(`${REDIS_PREFIX}${anilistId}`, String(tmdbId));
      } else {
        await redis.set(`${REDIS_PREFIX}${anilistId}`, 'null', 'EX', 6 * 3600);
      }
    } catch {
      // Redis write failed — still cache in memory
    }
  }

  memCache.set(anilistId, tmdbId);
  return tmdbId;
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

  if (anilistId) {
    // Use Redis-backed lookup keyed by AniList ID
    tmdbId = await resolveTmdbIdForAnilist(anilistId, titles);
  } else {
    // Fallback: search TMDB directly with titles
    for (const title of titles.slice(0, 4)) {
      if (!title?.trim() || !TMDB_API_KEY) continue;
      try {
        const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&include_adult=false`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
        if (!res.ok) continue;
        const json = (await res.json()) as { results?: Array<{ id: number }> };
        if (json.results?.[0]?.id) {
          tmdbId = json.results[0].id;
          break;
        }
      } catch {
        // continue
      }
    }
  }

  if (!tmdbId) {
    return { sources: [], tmdbId: null };
  }

  // Build all embed URLs
  const sources: ProviderSource[] = EMBED_SOURCES.map((def) => ({
    url: def.buildUrl(tmdbId!, season, episode, type),
    quality: type === 'dub' ? `${def.name} (Dub)` : def.name,
    isM3U8: false,
    isEmbed: true,
  }));

  console.log(`[EmbedProvider] Built ${sources.length} embed sources for TMDB ${tmdbId} S${season}E${episode} (${type})`);
  return { sources, tmdbId };
}

/**
 * Health check — just verify we have a TMDB key.
 */
export function isEmbedProviderAvailable(): boolean {
  return !!TMDB_API_KEY;
}
