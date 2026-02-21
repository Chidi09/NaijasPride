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
  sessions?: string[];
};

const DEFAULT_FLARESOLVERR_URL = 'http://flaresolverr:8191';

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
  private readonly sessionMaxAgeMs: number;
  private readonly sessions = new Map<string, number>();

  constructor() {
    const configured = (process.env.FLARESOLVERR_URL || DEFAULT_FLARESOLVERR_URL).trim();
    this.flaresolverrUrl = configured || DEFAULT_FLARESOLVERR_URL;
    const configuredSessionTtl = Number.parseInt(process.env.FLARESOLVERR_SESSION_MAX_AGE_MS || '1800000', 10);
    this.sessionMaxAgeMs = Number.isFinite(configuredSessionTtl) && configuredSessionTtl > 0
      ? configuredSessionTtl
      : 1_800_000;
  }

  canHandle(): boolean {
    return !!this.flaresolverrUrl;
  }

  async listSessions(): Promise<string[]> {
    const data = await this.call<FlareSolverrResponse>({ cmd: 'sessions.list' }, 10_000);
    if (data.status !== 'ok') {
      throw new Error(data.message || 'FlareSolverr sessions.list failed');
    }

    return data.sessions || [];
  }

  async destroySession(sessionId: string): Promise<void> {
    const data = await this.call<FlareSolverrResponse>({ cmd: 'sessions.destroy', session: sessionId }, 10_000);
    if (data.status !== 'ok') {
      throw new Error(data.message || `FlareSolverr failed to destroy session ${sessionId}`);
    }
    this.sessions.delete(sessionId);
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.listSessions();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'FlareSolverr health check failed',
      };
    }
  }

  async get(url: string, options: FetchRequestOptions = {}): Promise<FetchResponse> {
    const session = options.sourceId ? `np-${options.sourceId}` : 'np-default';
    await this.ensureSession(session);

    const payload: Record<string, unknown> = {
      cmd: 'request.get',
      url,
      maxTimeout: options.timeoutMs ?? 60000,
      session,
    };

    const requestHeaders = options.headers || {};
    if (Object.keys(requestHeaders).length > 0) {
      payload.headers = requestHeaders;
    }

    const data = await this.call<FlareSolverrResponse>(payload, Math.max(65000, (options.timeoutMs ?? 60000) + 5000));
    if (!data || data.status !== 'ok' || !data.solution) {
      const message = data?.message || 'FlareSolverr request failed';
      const normalizedMessage = message.toLowerCase();
      const isMissingSession =
        normalizedMessage.includes('session') &&
        (normalizedMessage.includes('not found') || normalizedMessage.includes('does not exist'));

      if (isMissingSession) {
        await this.recreateSession(session);
        const retried = await this.call<FlareSolverrResponse>(payload, Math.max(65000, (options.timeoutMs ?? 60000) + 5000));
        if (!retried || retried.status !== 'ok' || !retried.solution) {
          throw new Error(retried?.message || 'FlareSolverr request failed after session recreation');
        }

        return {
          url: retried.solution.url || url,
          status: retried.solution.status,
          headers: normalizeHeaders((retried.solution.headers || {}) as Record<string, unknown>),
          body: retried.solution.response || '',
          fetchedVia: this.id,
        };
      }

      throw new Error(message);
    }

    this.sessions.set(session, Date.now());

    return {
      url: data.solution.url || url,
      status: data.solution.status,
      headers: normalizeHeaders((data.solution.headers || {}) as Record<string, unknown>),
      body: data.solution.response || '',
      fetchedVia: this.id,
    };
  }

  private async ensureSession(session: string): Promise<void> {
    const createdAt = this.sessions.get(session);
    const now = Date.now();

    if (createdAt && now - createdAt < this.sessionMaxAgeMs) {
      return;
    }

    if (createdAt) {
      try {
        await this.destroySession(session);
      } catch {
        // Ignore destroy errors and recreate fresh.
      }
    }

    await this.createSession(session);
  }

  private async recreateSession(session: string): Promise<void> {
    try {
      await this.destroySession(session);
    } catch {
      // Ignore, createSession is the important step.
    }
    await this.createSession(session);
  }

  private async createSession(session: string): Promise<void> {
    const data = await this.call<FlareSolverrResponse>({ cmd: 'sessions.create', session }, 15_000);
    if (data.status !== 'ok') {
      const message = data.message || `FlareSolverr failed to create session ${session}`;
      if (message.toLowerCase().includes('already exists')) {
        this.sessions.set(session, Date.now());
        return;
      }

      throw new Error(data.message || `FlareSolverr failed to create session ${session}`);
    }
    this.sessions.set(session, Date.now());
  }

  private async call<T>(payload: Record<string, unknown>, timeoutMs: number): Promise<T> {
    const response = await axios.post<FlareSolverrResponse>(`${this.flaresolverrUrl}/v1`, payload, {
      timeout: timeoutMs,
      validateStatus: () => true,
    });

    if (!response.data) {
      throw new Error('FlareSolverr returned an empty response');
    }

    return response.data as unknown as T;
  }
}
