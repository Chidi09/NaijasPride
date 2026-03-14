// apps/api/src/modules/anime/anime-provider-manager.ts
// Multi-provider anime source manager with fallback support

import { searchAniWatch, getAniWatchEpisodes, getAniWatchSources } from './aniwatch-provider';
import { 
  searchNineAnime, 
  getNineAnimeEpisodes, 
  getNineAnimeSources,
  checkNineAnimeHealth 
} from './nineanime-provider';
import { scrapeWithProxies, type ProxySource } from './proxy-scraper';
import { scrapeWithStealth, type ScrapedSource } from './stealth-browser';

export type ProviderType = 'aniwatch' | 'nineanime' | 'animepahe' | 'gogoanime' | 'zoro';

export type ProviderEpisode = {
  id: string;
  number: number;
  title?: string;
  image?: string;
};

export type ProviderSource = {
  url: string;
  quality: string;
  isM3U8: boolean;
  isEmbed?: boolean;
  referer?: string;
};

export type ProviderSubtitles = {
  url: string;
  lang: string;
};

export type ProviderResult = {
  provider: ProviderType;
  success: boolean;
  episodes?: ProviderEpisode[];
  sources?: ProviderSource[];
  subtitles?: ProviderSubtitles[];
  error?: string;
};

// Provider priority order - most reliable first
const DEFAULT_PROVIDER_ORDER: ProviderType[] = [
  'nineanime',
  'aniwatch',
  'animepahe',
];

// Provider health status cache
const providerHealth = new Map<ProviderType, { healthy: boolean; checkedAt: number }>();
const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function isProviderHealthy(provider: ProviderType): Promise<boolean> {
  const cached = providerHealth.get(provider);
  if (cached && Date.now() - cached.checkedAt < HEALTH_CACHE_TTL_MS) {
    return cached.healthy;
  }
  
  let healthy = false;
  
  switch (provider) {
    case 'nineanime':
      const nineHealth = await checkNineAnimeHealth();
      healthy = nineHealth.healthy;
      break;
    case 'aniwatch':
      // AniWatch rebranded to HiAnime and is now shut down
      healthy = false;
      break;
    case 'animepahe':
      // AnimePahe often blocks - mark as unhealthy by default
      healthy = false;
      break;
    default:
      healthy = false;
  }
  
  providerHealth.set(provider, { healthy, checkedAt: Date.now() });
  return healthy;
}

/**
 * Search for anime across multiple providers
 */
export async function searchAnimeMultiProvider(
  query: string,
  providers?: ProviderType[]
): Promise<ProviderResult[]> {
  const toTry = providers || DEFAULT_PROVIDER_ORDER;
  const results: ProviderResult[] = [];
  
  for (const provider of toTry) {
    try {
      switch (provider) {
        case 'aniwatch':
          const awResults = await searchAniWatch(query);
          if (awResults.length > 0) {
            results.push({
              provider,
              success: true,
            });
          }
          break;
          
        case 'nineanime':
          const naResults = await searchNineAnime(query);
          if (naResults.length > 0) {
            results.push({
              provider,
              success: true,
            });
          }
          break;
          
        default:
          // Skip unsupported providers
          break;
      }
    } catch (error) {
      results.push({
        provider,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  return results;
}

/**
 * Get episodes from the best available provider
 */
export async function getEpisodesMultiProvider(
  query: string,
  options: {
    preferredProvider?: ProviderType;
    tryAll?: boolean;
  } = {}
): Promise<ProviderResult & { episodes: ProviderEpisode[] }> {
  const { preferredProvider, tryAll = false } = options;
  
  // If preferred provider specified, try it first
  if (preferredProvider) {
    try {
      const result = await getEpisodesFromProvider(query, preferredProvider);
      if (result.success && result.episodes && result.episodes.length > 0) {
        return { ...result, episodes: result.episodes };
      }
    } catch {
      // Continue to fallback
    }
  }
  
  // Try providers in order until one succeeds
  for (const provider of DEFAULT_PROVIDER_ORDER) {
    if (provider === preferredProvider) continue; // Already tried
    
    try {
      const result = await getEpisodesFromProvider(query, provider);
      if (result.success && result.episodes && result.episodes.length > 0) {
        return { ...result, episodes: result.episodes };
      }
      
      if (!tryAll) break; // Stop after first failure if not trying all
    } catch {
      if (!tryAll) break;
    }
  }
  
  // No providers succeeded
  return {
    provider: preferredProvider || DEFAULT_PROVIDER_ORDER[0]!,
    success: false,
    episodes: [],
    error: 'No providers returned episodes',
  };
}

async function getEpisodesFromProvider(
  query: string,
  provider: ProviderType
): Promise<ProviderResult> {
  try {
    switch (provider) {
      case 'aniwatch':
        const awSearch = await searchAniWatch(query);
        if (awSearch.length === 0) {
          return { provider, success: false, error: 'Anime not found' };
        }
        const awEpisodes = await getAniWatchEpisodes(awSearch[0]!.id);
        return {
          provider,
          success: awEpisodes.length > 0,
          episodes: awEpisodes,
        };
        
      case 'nineanime':
        const naSearch = await searchNineAnime(query);
        if (naSearch.length === 0) {
          return { provider, success: false, error: 'Anime not found' };
        }
        const naEpisodes = await getNineAnimeEpisodes(naSearch[0]!.id);
        return {
          provider,
          success: naEpisodes.length > 0,
          episodes: naEpisodes,
        };
        
      default:
        return { provider, success: false, error: 'Provider not implemented' };
    }
  } catch (error) {
    return {
      provider,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get watch sources from the best available provider
 */
export async function getSourcesMultiProvider(
  animeQuery: string,
  episodeNumber: number,
  options: {
    preferredProvider?: ProviderType;
    type?: 'sub' | 'dub';
  } = {}
): Promise<{
  provider: ProviderType;
  sources: ProviderSource[];
  subtitles?: ProviderSubtitles[];
  episode?: ProviderEpisode;
  error?: string;
}> {
  const { preferredProvider, type = 'sub' } = options;
  
  // Try each provider
  const providersToTry = preferredProvider 
    ? [preferredProvider, ...DEFAULT_PROVIDER_ORDER.filter(p => p !== preferredProvider)]
    : DEFAULT_PROVIDER_ORDER;
  
  for (const provider of providersToTry) {
    try {
      const result = await getSourcesFromProvider(animeQuery, episodeNumber, provider, type);
      
      if (result.sources && result.sources.length > 0) {
        return result;
      }
    } catch {
      // Continue to next provider
    }
  }
  
  // If all providers failed, try ScrapingBee proxy service
  console.log(`[MultiProvider] All direct providers failed, trying ScrapingBee proxy...`);
  try {
    // Build a search URL for the anime episode
    const searchQuery = encodeURIComponent(`${animeQuery} episode ${episodeNumber}`);
    const proxyResult = await scrapeWithProxies(`https://9anime.to/search?keyword=${searchQuery}`, {
      retryWithStealth: true
    });
    
    if (proxyResult.sources.length > 0) {
      console.log(`[MultiProvider] Found ${proxyResult.sources.length} sources via ${proxyResult.method}`);
      return {
        provider: 'nineanime',
        sources: proxyResult.sources.map((s: ProxySource) => ({
          url: s.url,
          quality: s.quality,
          isM3U8: s.isM3U8,
          isEmbed: s.isEmbed,
          referer: 'https://9anime.to/',
        })),
        episode: {
          id: `proxy-ep-${episodeNumber}`,
          number: episodeNumber,
          title: `Episode ${episodeNumber}`,
        },
      };
    }
  } catch (error) {
    console.error('[MultiProvider] ScrapingBee proxy failed:', error);
  }
  
  // Last resort: try stealth browser
  console.log(`[MultiProvider] Trying stealth browser as last resort...`);
  try {
    const stealthResult = await scrapeWithStealth(`https://9anime.to/search?keyword=${encodeURIComponent(animeQuery)}`, {
      waitForVideo: true,
      timeout: 60000,
    });
    
    if (stealthResult.sources.length > 0) {
      console.log(`[MultiProvider] Found ${stealthResult.sources.length} sources via stealth browser`);
      return {
        provider: 'nineanime',
        sources: stealthResult.sources.map((s: ScrapedSource) => ({
          url: s.url,
          quality: s.quality,
          isM3U8: s.isM3U8,
          referer: s.referer || 'https://9anime.to/',
        })),
        episode: {
          id: `stealth-ep-${episodeNumber}`,
          number: episodeNumber,
          title: stealthResult.title || `Episode ${episodeNumber}`,
        },
      };
    }
  } catch (error) {
    console.error('[MultiProvider] Stealth browser failed:', error);
  }
  
  return {
    provider: providersToTry[0]!,
    sources: [],
    error: 'No playable sources found from any provider (direct, proxy, or stealth)',
  };
}

async function getSourcesFromProvider(
  animeQuery: string,
  episodeNumber: number,
  provider: ProviderType,
  type: 'sub' | 'dub'
): Promise<{
  provider: ProviderType;
  sources: ProviderSource[];
  subtitles?: ProviderSubtitles[];
  episode?: ProviderEpisode;
}> {
  switch (provider) {
    case 'aniwatch': {
      const awSearch = await searchAniWatch(animeQuery);
      if (awSearch.length === 0) return { provider, sources: [] };
      
      const awEpisodes = await getAniWatchEpisodes(awSearch[0]!.id);
      const awEpisode = awEpisodes.find(e => e.number === episodeNumber);
      if (!awEpisode) return { provider, sources: [] };
      
      const { sources, subtitles } = await getAniWatchSources(awEpisode.id, type);
      return {
        provider,
        sources: sources.map(s => ({
          url: s.url,
          quality: s.quality,
          isM3U8: s.isM3U8,
          isEmbed: s.isEmbed,
          referer: 'https://hianime.to/',
        })),
        subtitles,
        episode: awEpisode,
      };
    }
    
    case 'nineanime': {
      const naSearch = await searchNineAnime(animeQuery);
      if (naSearch.length === 0) return { provider, sources: [] };
      
      const naEpisodes = await getNineAnimeEpisodes(naSearch[0]!.id);
      const naEpisode = naEpisodes.find(e => e.number === episodeNumber);
      if (!naEpisode) return { provider, sources: [] };
      
      const { sources, subtitles } = await getNineAnimeSources(naEpisode.id, naSearch[0]!.id);
      return {
        provider,
        sources: sources.map(s => ({
          url: s.url,
          quality: s.quality,
          isM3U8: s.isM3U8,
          isEmbed: s.isEmbed,
          referer: 'https://9anime.to/',
        })),
        subtitles,
        episode: naEpisode,
      };
    }
    
    default:
      return { provider, sources: [] };
  }
}

/**
 * Get health status of all providers
 */
export async function getProvidersHealth(): Promise<Record<ProviderType, { healthy: boolean; message: string }>> {
  const health: Record<ProviderType, { healthy: boolean; message: string }> = {
    aniwatch: { healthy: false, message: 'Shut down (rebranded to HiAnime, now offline)' },
    nineanime: { healthy: false, message: 'Not checked' },
    animepahe: { healthy: false, message: 'Often blocks requests' },
    gogoanime: { healthy: false, message: 'API deprecated/broken' },
    zoro: { healthy: false, message: 'API deprecated/broken' },
  };
  
  // Check 9anime
  const nineHealth = await checkNineAnimeHealth();
  health.nineanime = {
    healthy: nineHealth.healthy,
    message: nineHealth.message,
  };
  
  return health;
}
