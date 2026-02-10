import axios from 'axios';
import { FetchRequestOptions, FetchResponse, SourceFetcher } from './types';

type FlareSolverrResponse = {
  status: string;
  message?: string;
  solution?: {
    status: number;
    url: string;
    response: string;
    headers?: Record<string, string>;
    cookies?: Array<Record<string, unknown>>;
    userAgent?: string;
  };
};

const normalizeHeaders = (
  headers: Record<string, unknown>
): Record<string, string | string[] | undefined> => {
  const normalized: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string' || Array.isArray(value) || typeof value === 'undefined') {
      normalized[key] = value;
      continue;
    }
    if (value === null) {
      normalized[key] = undefined;
      continue;
    }
    normalized[key] = String(value);
  }
  return normalized;
};

export class FlareSolverrFetcher implements SourceFetcher {
  readonly id = 'flaresolverr' as const;

  private readonly flaresolverrUrl: string | null;

  constructor() {
    const configured = process.env.FLARESOLVERR_URL?.trim();
    this.flaresolverrUrl = configured || null;
  }

  canHandle(): boolean {
    return !!this.flaresolverrUrl;
  }

  async get(url: string, options: FetchRequestOptions = {}): Promise<FetchResponse> {
    if (!this.flaresolverrUrl) {
      throw new Error('FlareSolverr is not configured (FLARESOLVERR_URL missing)');
    }

    const session = options.sourceId ? `np-${options.sourceId}` : 'np-default';

    const payload = {
      cmd: 'request.get',
      url,
      maxTimeout: options.timeoutMs ?? 60000,
      session,
      headers: options.headers || {},
    };

    const response = await axios.post<FlareSolverrResponse>(`${this.flaresolverrUrl}/v1`, payload, {
      timeout: Math.max(65000, (options.timeoutMs ?? 60000) + 5000),
      validateStatus: () => true,
    });

    const data = response.data;
    if (!data || data.status !== 'ok' || !data.solution) {
      throw new Error(data?.message || 'FlareSolverr request failed');
    }

    return {
      url: data.solution.url || url,
      status: data.solution.status,
      headers: normalizeHeaders((data.solution.headers || {}) as Record<string, unknown>),
      body: data.solution.response || '',
      fetchedVia: this.id,
    };
  }
}
