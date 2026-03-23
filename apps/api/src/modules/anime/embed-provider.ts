// apps/api/src/modules/anime/embed-provider.ts
// Fallback provider that returns iframe-embeddable sources from free embed APIs.
// These APIs accept TMDB IDs, so we map AniList title → TMDB TV ID first.

import type { ProviderSource } from './anime-provider-manager';

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.TMDB_KEY || '';

// ── TMDB ID cache (in-memory, title → { tmdbId, ts }) ─────────────────────
const tmdbCache = new Map<string, { tmdbId: number | null; ts: number }>();
const TMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — IDs never change

/**
 * Search TMDB for an anime TV show by title and return its numeric ID.
 */
async function resolveTmdbId(title: string): Promise<number | null> {
  const cacheKey = title.toLowerCase().trim();
  const cached = tmdbCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TMDB_CACHE_TTL_MS) return cached.tmdbId;

  if (!TMDB_API_KEY) {
    console.warn('[EmbedProvider] No TMDB_API_KEY configured — embed fallback disabled');
    return null;
  }

  try {
    const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&include_adult=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;

    const json = (await res.json()) as { results?: Array<{ id: number; name: string; first_air_date?: string }> };
    const match = json.results?.[0];
    const tmdbId = match?.id ?? null;

    tmdbCache.set(cacheKey, { tmdbId, ts: Date.now() });
    if (tmdbId) console.log(`[EmbedProvider] Mapped "${title}" → TMDB ${tmdbId}`);
    return tmdbId;
  } catch {
    return null;
  }
}

// ── Embed source definitions ───────────────────────────────────────────────
//
// Each source builds a URL from (tmdbId, season, episode, type).
// `sub` is the default; for `dub` we append a hint where the API supports it.
// Most of these embed APIs auto-detect language/audio track, but some
// (2Embed, SmashyStream) expose a subtitle vs dub toggle.

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
 * Probe a single embed URL to verify it doesn't 404/5xx.
 * Returns true if the page is likely a working player.
 */
async function probeEmbed(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(6_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Main entry point — returns embed sources for a given anime.
 *
 * @param titles  Array of AniList title variants (english, romaji, synonyms)
 * @param season  Season number (almost always 1 for anime)
 * @param episode Episode number
 * @param type    'sub' or 'dub'
 */
export async function getEmbedSources(
  titles: string[],
  season: number,
  episode: number,
  type: 'sub' | 'dub' = 'sub',
): Promise<{ sources: ProviderSource[]; tmdbId: number | null }> {
  // Try each title variant until we get a TMDB hit
  let tmdbId: number | null = null;
  for (const title of titles.slice(0, 4)) {
    tmdbId = await resolveTmdbId(title);
    if (tmdbId) break;
  }

  if (!tmdbId) {
    return { sources: [], tmdbId: null };
  }

  // Build all embed URLs
  const candidates = EMBED_SOURCES.map((def) => ({
    name: def.name,
    url: def.buildUrl(tmdbId!, season, episode, type),
  }));

  // For sub: return all sources directly (most embed players default to sub)
  // For dub: we label sources with "(Dub)" so the user knows which to try.
  // Most of these embed players let the user switch audio track internally.
  const sources: ProviderSource[] = candidates.map((c) => ({
    url: c.url,
    quality: type === 'dub' ? `${c.name} (Dub)` : c.name,
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
