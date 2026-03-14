// apps/api/src/modules/anime/aniwatch-provider.ts
// AniWatch.to provider - currently one of the most reliable anime sources

import { extractVideoSources, VideoSource } from './video-source-extractor';

const ANIWATCH_BASE = process.env.ANIWATCH_BASE_URL || 'https://aniwatch.to';
const ANIWATCH_API = `${ANIWATCH_BASE}/ajax`;

export type AniWatchEpisode = {
  id: string;
  number: number;
  title?: string;
  image?: string;
};

export type AniWatchSource = {
  url: string;
  quality: string;
  isM3U8: boolean;
  isEmbed?: boolean;
};

async function aniwatchRequest<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html',
        'Referer': ANIWATCH_BASE,
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export async function searchAniWatch(query: string): Promise<Array<{ id: string; title: string }>> {
  const url = `${ANIWATCH_API}/search/suggest?keyword=${encodeURIComponent(query)}`;
  const data = await aniwatchRequest<{ html?: string }>(url);
  
  if (!data?.html) return [];
  
  // Extract anime IDs from HTML
  const results: Array<{ id: string; title: string }> = [];
  const idMatches = data.html.matchAll(/href="\/([^"]+)"/g);
  const titleMatches = data.html.matchAll(/class="film-name"[^>]*>([^<]+)/g);
  
  const ids = Array.from(idMatches).map(m => m[1]).filter(Boolean);
  const titles = Array.from(titleMatches).map(m => m[1]).filter(Boolean);
  
  for (let i = 0; i < Math.min(ids.length, titles.length); i++) {
    results.push({ id: ids[i]!, title: titles[i]! });
  }
  
  return results;
}

export async function getAniWatchEpisodes(animeId: string): Promise<AniWatchEpisode[]> {
  // Extract numeric ID if full URL/path provided
  const numericId = animeId.match(/-(\d+)$/)?.[1] || animeId;
  
  const url = `${ANIWATCH_API}/v2/episode/list/${numericId}`;
  const data = await aniwatchRequest<{ html?: string }>(url);
  
  if (!data?.html) return [];
  
  const episodes: AniWatchEpisode[] = [];
  
  // Parse episode list from HTML
  const episodeMatches = data.html.matchAll(/data-id="(\d+)"[^>]*data-number="(\d+)"/g);
  for (const match of episodeMatches) {
    if (match[1] && match[2]) {
      episodes.push({
        id: match[1],
        number: parseInt(match[2], 10),
      });
    }
  }
  
  return episodes.sort((a, b) => a.number - b.number);
}

export async function getAniWatchSources(
  episodeId: string,
  type: 'sub' | 'dub' = 'sub'
): Promise<{ sources: AniWatchSource[]; subtitles?: Array<{url: string; lang: string}> }> {
  // Get available servers
  const serversUrl = `${ANIWATCH_API}/v2/episode/servers?episodeId=${encodeURIComponent(episodeId)}`;
  const serversData = await aniwatchRequest<{ html?: string }>(serversUrl);
  
  if (!serversData?.html) {
    return { sources: [] };
  }
  
  // Extract server IDs for the requested type (sub/dub)
  const serverIds: string[] = [];
  const serverMatches = serversData.html.matchAll(/data-id="(\d+)"/g);
  for (const match of serverMatches) {
    if (match[1]) serverIds.push(match[1]);
  }
  
  const sources: AniWatchSource[] = [];
  let subtitles: Array<{url: string; lang: string}> = [];
  
  // Try each server
  for (const serverId of serverIds.slice(0, 3)) {
    const sourceUrl = `${ANIWATCH_API}/v2/episode/sources?id=${encodeURIComponent(serverId)}`;
    const sourceData = await aniwatchRequest<{
      link?: string;
      sources?: Array<{url: string; quality?: string; isM3U8?: boolean}>;
      subtitles?: Array<{url: string; lang: string}>;
    }>(sourceUrl);
    
    if (!sourceData?.link) continue;
    
    // Collect subtitles if available
    if (sourceData.subtitles) {
      subtitles = sourceData.subtitles.filter(s => s.url && s.lang);
    }
    
    // Direct sources
    if (sourceData.sources && sourceData.sources.length > 0) {
      for (const src of sourceData.sources) {
        if (src.url) {
          sources.push({
            url: src.url,
            quality: src.quality || 'auto',
            isM3U8: src.isM3U8 || src.url.includes('.m3u8'),
            isEmbed: false,
          });
        }
      }
      break; // Got sources, no need to try more servers
    } else if (sourceData.link) {
      // Embed link - would need extraction
      sources.push({
        url: sourceData.link,
        quality: `server-${serverId}`,
        isM3U8: false,
        isEmbed: true,
      });
    }
  }
  
  return { sources, subtitles };
}
