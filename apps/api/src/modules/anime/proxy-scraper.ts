// apps/api/src/modules/anime/proxy-scraper.ts
// Scrape anime sites through rotating proxies to avoid IP blocks

// ScrapingBee API (paid service that handles JS rendering and proxies)
// API Key: DAFZ9OYEEVQ6BGFQMWTUY92LKZ82SSMGOVXFKD0B0EKMOZIQKVEHGT6Z6G2NV7PKV49L5K05EGMPTLU3
const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY || 'DAFZ9OYEEVQ6BGFQMWTUY92LKZ82SSMGOVXFKD0B0EKMOZIQKVEHGT6Z6G2NV7PKV49L5K05EGMPTLU3';
const SCRAPINGBEE_URL = 'https://app.scrapingbee.com/api/v1';

// ScrapingAnt API (alternative)
const SCRAPINGANT_API_KEY = process.env.SCRAPINGANT_API_KEY;
const SCRAPINGANT_URL = 'https://api.scrapingant.com/v2/general';

export type ProxySource = {
  url: string;
  quality: string;
  isM3U8: boolean;
  isEmbed?: boolean;
  proxy?: string;
};

/**
 * Scrape using ScrapingBee with optimized settings for anime sites
 */
export async function scrapeWithScrapingBee(
  targetUrl: string,
  options: {
    waitForSelector?: string;
    waitTime?: number;
    useStealthProxy?: boolean;
  } = {}
): Promise<{ sources: ProxySource[]; html?: string; cost?: number }> {
  const { 
    waitForSelector = 'video', 
    waitTime = 8000,
    useStealthProxy = false 
  } = options;

  try {
    const params = new URLSearchParams();
    params.set('api_key', SCRAPINGBEE_API_KEY);
    params.set('url', targetUrl);
    params.set('render_js', 'true');
    params.set('premium_proxy', 'true');
    params.set('country_code', 'us');
    params.set('wait', waitTime.toString());
    params.set('wait_for', waitForSelector);
    params.set('block_ads', 'true');
    params.set('json_response', 'true');  // Get JSON response with XHR data
    
    if (useStealthProxy) {
      params.set('stealth_proxy', 'true');
    }

    console.log(`[ScrapingBee] Scraping ${targetUrl} with wait_for=${waitForSelector}`);

    const response = await fetch(`${SCRAPINGBEE_URL}?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`ScrapingBee returned ${response.status}`);
    }

    const data = await response.json() as {
      body?: string;
      xhr?: Array<{ url: string; status_code: number; body?: string }>;
      cost?: number;
    };

    const cost = data.cost || 5;
    console.log(`[ScrapingBee] Request cost: ${cost} credits`);

    // Extract sources from HTML
    const htmlSources = extractSourcesFromHtml(data.body || '', targetUrl);
    
    // Extract sources from XHR requests (where video URLs often hide)
    const xhrSources: ProxySource[] = [];
    if (data.xhr && Array.isArray(data.xhr)) {
      for (const xhr of data.xhr) {
        if (xhr.url && (xhr.url.includes('.m3u8') || xhr.url.includes('.mp4'))) {
          xhrSources.push({
            url: xhr.url,
            quality: extractQuality(xhr.url),
            isM3U8: xhr.url.includes('.m3u8'),
          });
        }
        
        // Check XHR response body for video URLs
        if (xhr.body) {
          const bodySources = extractSourcesFromHtml(xhr.body, targetUrl);
          xhrSources.push(...bodySources.sources);
        }
      }
    }

    // Combine and deduplicate
    const allSources = [...htmlSources.sources, ...xhrSources];
    const seenUrls = new Set<string>();
    const uniqueSources = allSources.filter(source => {
      if (seenUrls.has(source.url)) return false;
      seenUrls.add(source.url);
      return true;
    });

    return { 
      sources: uniqueSources.slice(0, 20), 
      html: data.body,
      cost 
    };
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
 * Try multiple proxy methods - ScrapingBee is primary since we have API key
 */
export async function scrapeWithProxies(
  targetUrl: string,
  options: {
    retryWithStealth?: boolean;
  } = {}
): Promise<{ sources: ProxySource[]; method?: string; cost?: number }> {
  // Try ScrapingBee with premium proxy first
  console.log(`[ProxyScraper] Trying ScrapingBee for ${targetUrl}`);
  const result = await scrapeWithScrapingBee(targetUrl, {
    waitTime: 10000,
    useStealthProxy: false,
  });
  
  if (result.sources.length > 0) {
    return { 
      sources: result.sources, 
      method: 'scrapingbee-premium',
      cost: result.cost 
    };
  }

  // If failed and retryWithStealth is enabled, try with stealth proxy
  if (options.retryWithStealth) {
    console.log(`[ProxyScraper] Retrying with stealth proxy for ${targetUrl}`);
    const stealthResult = await scrapeWithScrapingBee(targetUrl, {
      waitTime: 15000,
      useStealthProxy: true,
    });
    
    if (stealthResult.sources.length > 0) {
      return { 
        sources: stealthResult.sources, 
        method: 'scrapingbee-stealth',
        cost: stealthResult.cost 
      };
    }
  }

  return { sources: [] };
}

/**
 * Check ScrapingBee health/status
 */
export async function checkScrapingBeeHealth(): Promise<{ healthy: boolean; message: string; credits?: number }> {
  try {
    const response = await fetch(`https://app.scrapingbee.com/api/v1/usage?api_key=${SCRAPINGBEE_API_KEY}`);
    
    if (!response.ok) {
      return { 
        healthy: false, 
        message: `ScrapingBee API error: ${response.status}` 
      };
    }
    
    const data = await response.json() as {
      max_api_credit?: number;
      used_api_credit?: number;
      renewal_subscription_date?: string;
    };
    
    const remaining = (data.max_api_credit || 0) - (data.used_api_credit || 0);
    
    return {
      healthy: true,
      message: `${remaining.toLocaleString()} credits remaining`,
      credits: remaining,
    };
  } catch (error) {
    return {
      healthy: false,
      message: `ScrapingBee unreachable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
