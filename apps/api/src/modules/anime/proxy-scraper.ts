// apps/api/src/modules/anime/proxy-scraper.ts
// Scrape anime sites through rotating proxies to avoid IP blocks

const PROXY_LIST = [
  // Free proxy list (these rotate frequently, should be updated)
  // In production, use paid residential proxy services like:
  // - BrightData
  // - Oxylabs  
  // - Smartproxy
  // - PacketStream
];

// ScrapingBee API (paid service that handles JS rendering and proxies)
const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
const SCRAPINGBEE_URL = 'https://app.scrapingbee.com/api/v1';

// ScrapingAnt API (alternative)
const SCRAPINGANT_API_KEY = process.env.SCRAPINGANT_API_KEY;
const SCRAPINGANT_URL = 'https://api.scrapingant.com/v2/general';

export type ProxySource = {
  url: string;
  quality: string;
  isM3U8: boolean;
  proxy?: string;
};

/**
 * Scrape using ScrapingBee (if API key available)
 */
export async function scrapeWithScrapingBee(
  targetUrl: string
): Promise<{ sources: ProxySource[]; html?: string }> {
  if (!SCRAPINGBEE_API_KEY) {
    return { sources: [] };
  }

  try {
    const params = new URLSearchParams({
      api_key: SCRAPINGBEE_API_KEY,
      url: targetUrl,
      render_js: 'true',
      premium_proxy: 'true',
      country_code: 'us',
      wait: '5000',
    });

    const response = await fetch(`${SCRAPINGBEE_URL}?${params.toString()}`, {
      headers: {
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`ScrapingBee returned ${response.status}`);
    }

    const html = await response.text();
    return extractSourcesFromHtml(html, targetUrl);
  } catch (error) {
    console.error('[ProxyScraper] ScrapingBee failed:', error);
    return { sources: [] };
  }
}

/**
 * Scrape using ScrapingAnt (if API key available)
 */
export async function scrapeWithScrapingAnt(
  targetUrl: string
): Promise<{ sources: ProxySource[]; html?: string }> {
  if (!SCRAPINGANT_API_KEY) {
    return { sources: [] };
  }

  try {
    const queryParams = new URLSearchParams();
    queryParams.set('url', targetUrl);
    queryParams.set('x-api-key', SCRAPINGANT_API_KEY);
    queryParams.set('browser', 'true');
    queryParams.set('proxy_country', 'us');
    queryParams.set('wait_for_selector', 'video');
    queryParams.set('timeout', '20000');

    const response = await fetch(`${SCRAPINGANT_URL}?${queryParams.toString()}`);

    if (!response.ok) {
      throw new Error(`ScrapingAnt returned ${response.status}`);
    }

    const html = await response.text();
    return extractSourcesFromHtml(html, targetUrl);
  } catch (error) {
    console.error('[ProxyScraper] ScrapingAnt failed:', error);
    return { sources: [] };
  }
}

/**
 * Extract video sources from HTML content
 */
function extractSourcesFromHtml(
  html: string,
  referer: string
): { sources: ProxySource[]; html: string } {
  const sources: ProxySource[] = [];
  const seenUrls = new Set<string>();

  // Extract m3u8 URLs
  const m3u8Pattern = /https?:\/\/[^\s"'\u003c>]+\.m3u8(?:\?[^\s"'\u003c>]+)?/gi;
  const m3u8Matches = html.matchAll(m3u8Pattern);
  for (const match of m3u8Matches) {
    const url = match[0];
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      sources.push({
        url,
        quality: extractQuality(url),
        isM3U8: true,
      });
    }
  }

  // Extract mp4 URLs
  const mp4Pattern = /https?:\/\/[^\s"'\u003c>]+\.mp4(?:\?[^\s"'\u003c>]+)?/gi;
  const mp4Matches = html.matchAll(mp4Pattern);
  for (const match of mp4Matches) {
    const url = match[0];
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      sources.push({
        url,
        quality: extractQuality(url),
        isM3U8: false,
      });
    }
  }

  // Extract from JSON in page
  try {
    const jsonPatterns = [
      /sources:\s*(\[[^\]]+\])/i,
      /"sources":\s*(\[[^\]]+\])/i,
      /var\s+sources\s*=\s*(\[[^\]]+\])/i,
    ];

    for (const pattern of jsonPatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const data = JSON.parse(match[1]);
        if (Array.isArray(data)) {
          for (const item of data) {
            const url = item.file || item.url || item.src;
            if (url && !seenUrls.has(url)) {
              seenUrls.add(url);
              sources.push({
                url,
                quality: item.label || item.quality || extractQuality(url),
                isM3U8: url.includes('.m3u8') || item.type === 'hls',
              });
            }
          }
        }
      }
    }
  } catch {
    // JSON parsing failed
  }

  return { sources: sources.slice(0, 20), html };
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
    if (match?.[1]) return match[1];
  }
  
  return 'auto';
}

/**
 * Try multiple proxy methods
 */
export async function scrapeWithProxies(
  targetUrl: string
): Promise<{ sources: ProxySource[]; method?: string }> {
  // Try ScrapingBee first
  if (SCRAPINGBEE_API_KEY) {
    const result = await scrapeWithScrapingBee(targetUrl);
    if (result.sources.length > 0) {
      return { sources: result.sources, method: 'scrapingbee' };
    }
  }

  // Try ScrapingAnt
  if (SCRAPINGANT_API_KEY) {
    const result = await scrapeWithScrapingAnt(targetUrl);
    if (result.sources.length > 0) {
      return { sources: result.sources, method: 'scrapingant' };
    }
  }

  return { sources: [] };
}
