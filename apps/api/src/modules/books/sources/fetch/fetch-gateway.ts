import { DirectHttpFetcher } from './direct-http.fetcher';
import { FlareSolverrFetcher } from './flaresolverr.fetcher';
import { sourceMetrics } from '../observability/source-metrics';
import { summarizeSourceError } from '../utils/error-summary';
import { FetchRequestOptions, FetchResponse, SourceFetcher } from './types';

const isCloudflareChallenge = (response: FetchResponse): boolean => {
  if (response.status === 403 || response.status === 503) {
    return true;
  }

  const body = response.body.toLowerCase();
  return (
    body.includes('cdn-cgi/challenge-platform') ||
    body.includes('cf-browser-verification') ||
    body.includes('just a moment...') ||
    body.includes('attention required') ||
    body.includes('sorry, you have been blocked')
  );
};

export type FetchGatewayHealth = {
  availableFetchers: Array<'direct' | 'flaresolverr'>;
  flaresolverr: {
    configured: boolean;
    ok: boolean;
    message?: string;
  };
};

export class FetchGateway {
  private readonly fetchers: SourceFetcher[];

  constructor(fetchers?: SourceFetcher[]) {
    this.fetchers = fetchers || [new DirectHttpFetcher(), new FlareSolverrFetcher()];
  }

  async getHealth(): Promise<FetchGatewayHealth> {
    const availableFetchers = this.fetchers
      .filter((fetcher) => fetcher.canHandle('https://example.com'))
      .map((fetcher) => fetcher.id);

    const flaresolverrFetcher = this.fetchers.find(
      (fetcher): fetcher is FlareSolverrFetcher => fetcher instanceof FlareSolverrFetcher
    );

    if (!flaresolverrFetcher) {
      return {
        availableFetchers,
        flaresolverr: {
          configured: false,
          ok: false,
          message: 'FlareSolverr fetcher is not registered',
        },
      };
    }

    const configured = flaresolverrFetcher.canHandle();
    if (!configured) {
      return {
        availableFetchers,
        flaresolverr: {
          configured: false,
          ok: false,
          message: 'FLARESOLVERR_URL is not configured',
        },
      };
    }

    const health = await flaresolverrFetcher.checkHealth();
    return {
      availableFetchers,
      flaresolverr: {
        configured: true,
        ok: health.ok,
        message: health.message,
      },
    };
  }

  async get(url: string, options: FetchRequestOptions = {}): Promise<FetchResponse> {
    const sourceId = options.sourceId || 'unknown';
    const [primary, ...fallbacks] = this.fetchers;

    if (!primary || !primary.canHandle(url, options)) {
      throw new Error('No fetcher configured for request');
    }

    const primaryResponse = await primary.get(url, options);
    sourceMetrics.incrementFetcherUsage(sourceId, primary.id);
    if (!isCloudflareChallenge(primaryResponse)) {
      return primaryResponse;
    }

    sourceMetrics.incrementChallengeDetected(sourceId);

    for (const fallback of fallbacks) {
      if (!fallback.canHandle(url, options)) continue;

      try {
        const fallbackResponse = await fallback.get(url, options);
        sourceMetrics.incrementFetcherUsage(sourceId, fallback.id);
        if (fallbackResponse.status >= 200 && fallbackResponse.status < 500) {
          return fallbackResponse;
        }
      } catch (error) {
        console.warn(`[FetchGateway] fallback ${fallback.id} failed: ${summarizeSourceError(error)}`);
        sourceMetrics.incrementError(sourceId);
      }
    }

    return primaryResponse;
  }
}
