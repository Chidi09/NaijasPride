import { DirectHttpFetcher } from './direct-http.fetcher';
import { FlareSolverrFetcher } from './flaresolverr.fetcher';
import { sourceMetrics } from '../observability/source-metrics';
import { FetchRequestOptions, FetchResponse, SourceFetcher } from './types';

const isCloudflareChallenge = (response: FetchResponse): boolean => {
  if (response.status === 403 || response.status === 503) {
    return true;
  }

  const body = response.body.toLowerCase();
  return (
    body.includes('cdn-cgi/challenge-platform') ||
    body.includes('cf-browser-verification') ||
    body.includes('just a moment...')
  );
};

export class FetchGateway {
  private readonly fetchers: SourceFetcher[];

  constructor(fetchers?: SourceFetcher[]) {
    this.fetchers = fetchers || [new DirectHttpFetcher(), new FlareSolverrFetcher()];
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
        console.warn(`[FetchGateway] fallback ${fallback.id} failed:`, error);
        sourceMetrics.incrementError(sourceId);
      }
    }

    return primaryResponse;
  }
}
