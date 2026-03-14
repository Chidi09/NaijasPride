// apps/api/src/modules/anime/nineanime-provider.ts
// 9anime.to provider implementation

export type NineAnimeEpisode = {
  id: string;
  number: number;
  title?: string;
};

export type NineAnimeSource = {
  url: string;
  quality: string;
  isM3U8: boolean;
  isEmbed?: boolean;
};

const NINEANIME_BASE = process.env.NINEANIME_BASE_URL || 'https://9anime.to';
const NINEANIME_API = `${NINEANIME_BASE}/ajax`;

// Common browser headers to avoid blocking
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': NINEANIME_BASE,
  'Origin': NINEANIME_BASE,
};

async function nineAnimeRequest<T>(url: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...BROWSER_HEADERS,
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.warn(`[9anime] Request failed: ${response.status} for ${url}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      return await response.json() as T;
    }
    
    // Return text for HTML responses
    const text = await response.text();
    return { html: text } as unknown as T;
    
  } catch (error) {
    console.warn(`[9anime] Request error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function searchNineAnime(query: string): Promise<Array<{ id: string; title: string; url: string }>> {
  const encodedQuery = encodeURIComponent(query);
  const url = `${NINEANIME_BASE}/search?keyword=${encodedQuery}`;
  
  const data = await nineAnimeRequest<{ html?: string }>(url);
  if (!data?.html) return [];
  
  const results: Array<{ id: string; title: string; url: string }> = [];
  
  // Parse anime items from HTML
  // 9anime uses various HTML structures, try multiple patterns
  const patterns = [
    /<a[^>]*href="\/watch\/([^"]+)"[^>]*>[^<]*<img[^>]*alt="([^"]+)"/gi,
    /<a[^>]*href="\/watch\/([^"]+)"[^>]*class="[^"]*poster[^"]*"[^>]*>[^<]*<img[^>]*title="([^"]+)"/gi,
    /<div[^>]*class="[^"]*item[^"]*"[^>]*>[^<]*<a[^>]*href="\/watch\/([^"]+)"[^>]*>[^<]*<[^>]*title="([^"]+)"/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = data.html.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[2]) {
        results.push({
          id: match[1].split('?')[0]!, // Remove query params
          title: match[2].trim(),
          url: `${NINEANIME_BASE}/watch/${match[1]}`,
        });
      }
    }
    
    if (results.length > 0) break; // Found matches with this pattern
  }
  
  // Deduplicate by ID
  const seen = new Set<string>();
  return results.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

export async function getNineAnimeEpisodes(animeId: string): Promise<NineAnimeEpisode[]> {
  // animeId might be full URL or just the ID part
  const cleanId = animeId.replace(`${NINEANIME_BASE}/watch/`, '').split('?')[0];
  const url = `${NINEANIME_BASE}/watch/${cleanId}`;
  
  const data = await nineAnimeRequest<{ html?: string }>(url);
  if (!data?.html) return [];
  
  const episodes: NineAnimeEpisode[] = [];
  
  // Try to find episode list in HTML
  // Look for episode data in various formats
  const episodePatterns = [
    /data-id="([^"]+)"[^>]*data-number="(\d+)"/gi,
    /href="#episode-(\d+)"[^>]*data-id="([^"]+)"/gi,
    /<a[^>]*ep-(\d+)[^>]*data-id="([^"]+)"/gi,
  ];
  
  for (const pattern of episodePatterns) {
    const matches = data.html.matchAll(pattern);
    for (const match of matches) {
      let epNum: number;
      let epId: string;
      
      if (match[1] && match[2]) {
        // Try to figure out which is episode number and which is ID
        const num1 = parseInt(match[1], 10);
        const num2 = parseInt(match[2], 10);
        
        if (!isNaN(num1) && isNaN(num2)) {
          epNum = num1;
          epId = match[2]!;
        } else if (!isNaN(num2) && isNaN(num1)) {
          epNum = num2;
          epId = match[1]!;
        } else if (!isNaN(num1) && !isNaN(num2)) {
          // Both are numbers, smaller one is likely episode number
          if (num1 < 1000) {
            epNum = num1;
            epId = match[2]!;
          } else {
            epNum = num2;
            epId = match[1]!;
          }
        } else {
          continue;
        }
        
        if (!episodes.some(e => e.number === epNum)) {
          episodes.push({
            id: epId,
            number: epNum,
          });
        }
      }
    }
    
    if (episodes.length > 0) break;
  }
  
  // Alternative: Look for JSON data in page
  if (episodes.length === 0) {
    const jsonMatch = data.html.match(/var\s+episodes\s*=\s*(\[.+?\]);/i) || 
                      data.html.match(/"episodes":\s*(\[.+?\])/i);
    if (jsonMatch?.[1]) {
      try {
        const epData = JSON.parse(jsonMatch[1]);
        if (Array.isArray(epData)) {
          for (const ep of epData) {
            if (ep.id && (ep.number || ep.episode)) {
              episodes.push({
                id: String(ep.id),
                number: parseInt(ep.number || ep.episode, 10),
                title: ep.title,
              });
            }
          }
        }
      } catch {
        // JSON parse failed
      }
    }
  }
  
  return episodes.sort((a, b) => a.number - b.number);
}

export async function getNineAnimeSources(
  episodeId: string,
  animeId?: string
): Promise<{ sources: NineAnimeSource[]; subtitles?: Array<{url: string; lang: string}> }> {
  // Build episode watch URL
  let watchUrl: string;
  if (episodeId.startsWith('http')) {
    watchUrl = episodeId;
  } else if (animeId) {
    const cleanAnimeId = animeId.replace(`${NINEANIME_BASE}/watch/`, '').split('?')[0];
    watchUrl = `${NINEANIME_BASE}/watch/${cleanAnimeId}/ep-${episodeId}`;
  } else {
    return { sources: [] };
  }
  
  const data = await nineAnimeRequest<{ html?: string }>(watchUrl);
  if (!data?.html) return { sources: [] };
  
  const sources: NineAnimeSource[] = [];
  const subtitles: Array<{url: string; lang: string}> = [];
  
  // Extract video URLs from page
  // Look for m3u8 and mp4 URLs
  const urlPatterns = [
    /https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]+)?/gi,
    /https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]+)?/gi,
  ];
  
  const seenUrls = new Set<string>();
  
  for (const pattern of urlPatterns) {
    const matches = data.html.matchAll(pattern);
    for (const match of matches) {
      const url = match[0];
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        sources.push({
          url,
          quality: extractQuality(url),
          isM3U8: url.includes('.m3u8'),
        });
      }
    }
  }
  
  // Look for source data in JSON
  const sourcePatterns = [
    /sources:\s*(\[[^\]]+\])/i,
    /"sources":\s*(\[[^\]]+\])/i,
    /var\s+sources\s*=\s*(\[[^\]]+\])/i,
  ];
  
  for (const pattern of sourcePatterns) {
    const match = data.html.match(pattern);
    if (match?.[1]) {
      try {
        const sourceData = JSON.parse(match[1]);
        if (Array.isArray(sourceData)) {
          for (const src of sourceData) {
            if (src.file || src.url || src.src) {
              const url = src.file || src.url || src.src;
              if (!seenUrls.has(url)) {
                seenUrls.add(url);
                sources.push({
                  url,
                  quality: src.label || src.quality || extractQuality(url),
                  isM3U8: url.includes('.m3u8') || src.type === 'hls',
                });
              }
            }
          }
        }
      } catch {
        // Parse failed
      }
    }
    
    if (sources.length > 0) break;
  }
  
  // Extract subtitle tracks
  const subtitlePattern = /tracks:\s*(\[[^\]]+\])/i;
  const subtitleMatch = data.html.match(subtitlePattern);
  if (subtitleMatch?.[1]) {
    try {
      const trackData = JSON.parse(subtitleMatch[1]);
      if (Array.isArray(trackData)) {
        for (const track of trackData) {
          if (track.file && track.kind === 'captions') {
            subtitles.push({
              url: track.file,
              lang: track.label || track.srclang || 'Unknown',
            });
          }
        }
      }
    } catch {
      // Parse failed
    }
  }
  
  return { sources: sources.slice(0, 10), subtitles }; // Limit to top 10 sources
}

function extractQuality(url: string): string {
  const patterns = [
    /(\d{3,4}p)/i,
    /_([\d]+)_/,
    /quality[=_-]([^&/]+)/i,
    /([\d]+)k/i,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  
  return 'auto';
}

// Health check function
export async function checkNineAnimeHealth(): Promise<{ healthy: boolean; message: string }> {
  try {
    const response = await fetch(NINEANIME_BASE, {
      headers: BROWSER_HEADERS,
      method: 'HEAD',
    });
    
    if (response.ok) {
      return { healthy: true, message: '9anime accessible' };
    }
    return { healthy: false, message: `9anime returned ${response.status}` };
  } catch (error) {
    return { 
      healthy: false, 
      message: `9anime unreachable: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}
