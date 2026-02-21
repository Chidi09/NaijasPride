import axios from 'axios';
import { retryWithBackoff, RetryableError } from '../../../../shared/utils/retry';

export type ElsciRequestedFormat = 'epub' | 'pdf' | 'any';

// Cache for catalog data
const catalogCache = new Map<string, { items: ElsciCatalogItem[]; timestamp: number }>();
const CACHE_TTL_MS = 300000; // 5 minutes

export type ElsciCatalogItem = {
  href: string;
  time: number | null;
  size: number | null;
};

export type ElsciLightNovelFile = {
  href: string;
  absoluteUrl: string;
  title: string;
  series: string;
  fileName: string;
  format: 'EPUB' | 'PDF';
  sizeBytes: number | null;
  modifiedAtMs: number | null;
};

export type DiscoverElsciLightNovelOptions = {
  baseUrl?: string;
  rootPath?: string;
  maxFiles?: number;
  formatPreference?: ElsciRequestedFormat;
  includePattern?: string;
  excludePattern?: string;
  timeoutMs?: number;
};

type H5aiItemResponse = {
  href?: unknown;
  time?: unknown;
  size?: unknown;
};

type FlareSolverrHttpResponse = {
  status?: string;
  message?: string;
  solution?: {
    status?: number;
    response?: string;
    cookies?: Array<Record<string, unknown>>;
    userAgent?: string;
  };
};

const DEFAULT_ELSCI_BASE_URL = 'https://server.elsci.one';
const DEFAULT_ELSCI_ROOT_PATH = '/Officially%20Translated%20Light%20Novels/';
const DEFAULT_FLARESOLVERR_URL = 'http://flaresolverr:8191';
const DEFAULT_TIMEOUT_MS = 60_000;
const H5AI_CATALOG_WHAT = 2;
const ELSCI_FLARESOLVERR_SESSION = 'np-elsci-light-novels';
const CHALLENGE_STATUS_CODES = new Set([403, 429, 503, 520, 521, 522, 523]);

const DEFAULT_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'application/json,text/plain,*/*',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json;charset=utf-8',
} as const;

const buildElsciCatalogRequestBody = (rootPath: string) => ({
  action: 'get',
  items: {
    href: rootPath,
    what: H5AI_CATALOG_WHAT,
  },
});

const buildElsciCatalogFormBody = (rootPath: string): string => {
  const params = new URLSearchParams();
  params.set('action', 'get');
  params.set('items[href]', rootPath);
  params.set('items[what]', String(H5AI_CATALOG_WHAT));
  return params.toString();
};

const buildElsciRequestHeaders = (baseUrl: string, cookieHeader?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    origin: baseUrl,
    referer: `${baseUrl}/`,
    'x-requested-with': 'XMLHttpRequest',
  };

  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  return headers;
};

const extractCookieHeader = (setCookieHeader: string | string[] | undefined): string | null => {
  if (!setCookieHeader) return null;

  const values = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const cookieParts = values
    .map((entry) => entry.split(';')[0]?.trim())
    .filter((entry): entry is string => !!entry);

  return cookieParts.length > 0 ? cookieParts.join('; ') : null;
};

const getFlareSolverrUrl = (): string => {
  const configured = (process.env.FLARESOLVERR_URL || DEFAULT_FLARESOLVERR_URL).trim();
  return configured.replace(/\/+$/, '') || DEFAULT_FLARESOLVERR_URL;
};

const buildElsciFileRequestHeaders = (
  baseUrl: string,
  options: { cookieHeader?: string | null; userAgent?: string | null } = {},
): Record<string, string> => {
  const headers: Record<string, string> = {
    'user-agent': options.userAgent || DEFAULT_HEADERS['user-agent'],
    accept: '*/*',
    'accept-language': DEFAULT_HEADERS['accept-language'],
    referer: `${baseUrl}/`,
    origin: baseUrl,
  };

  if (options.cookieHeader) {
    headers.cookie = options.cookieHeader;
  }

  return headers;
};

const toCookieHeaderFromFlareSolverrCookies = (
  cookies: Array<Record<string, unknown>> | undefined,
): string | null => {
  if (!Array.isArray(cookies) || cookies.length === 0) return null;

  const cookieParts = cookies
    .map((entry) => {
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      const value = typeof entry.value === 'string' ? entry.value : '';
      if (!name) return null;
      return `${name}=${value}`;
    })
    .filter((entry): entry is string => !!entry);

  return cookieParts.length > 0 ? cookieParts.join('; ') : null;
};

const resolveElsciAccessViaFlareSolverr = async (options: {
  baseUrl: string;
  timeoutMs: number;
}): Promise<{ cookieHeader: string | null; userAgent: string | null }> => {
  const flaresolverrUrl = getFlareSolverrUrl();

  const response = await axios.post<FlareSolverrHttpResponse>(
    `${flaresolverrUrl}/v1`,
    {
      cmd: 'request.get',
      session: ELSCI_FLARESOLVERR_SESSION,
      maxTimeout: options.timeoutMs,
      url: `${options.baseUrl}/`,
    },
    {
      timeout: Math.max(65_000, options.timeoutMs + 5_000),
      validateStatus: () => true,
    },
  );

  const data = response.data;
  if (!data || data.status !== 'ok' || !data.solution) {
    throw new Error(data?.message || 'FlareSolverr request failed');
  }

  const status = data.solution.status;
  if (typeof status !== 'number' || status < 200 || status >= 400) {
    throw new Error(`FlareSolverr returned non-success HTTP status ${status ?? 'unknown'}`);
  }

  return {
    cookieHeader: toCookieHeaderFromFlareSolverrCookies(data.solution.cookies as Array<Record<string, unknown>> | undefined),
    userAgent: typeof data.solution.userAgent === 'string' ? data.solution.userAgent : null,
  };
};

const getAxiosStatusCode = (error: unknown): number | null => {
  if (!axios.isAxiosError(error)) return null;
  const status = error.response?.status;
  return typeof status === 'number' ? status : null;
};

const isAccessChallengeStatus = (status: number | null): boolean => {
  if (typeof status !== 'number') return false;
  return CHALLENGE_STATUS_CODES.has(status);
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export type ElsciHealthStatus = {
  healthy: boolean;
  message: string;
  lastChecked: Date;
  responseTimeMs: number;
};

export async function checkElsciHealth(
  baseUrl?: string,
  timeoutMs: number = 10000
): Promise<ElsciHealthStatus> {
  const url = normalizeBaseUrl(baseUrl);
  const startTime = Date.now();
  
  try {
    await axios.get(`${url}/`, {
      timeout: timeoutMs,
      headers: DEFAULT_HEADERS,
      validateStatus: (status) => status >= 200 && status < 500,
    });
    
    return {
      healthy: true,
      message: 'Elsci server is accessible',
      lastChecked: new Date(),
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      healthy: false,
      message: `Elsci health check failed: ${toErrorMessage(error)}`,
      lastChecked: new Date(),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

const parseElsciResponseBody = (rawBody: string): { items?: unknown } => {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    throw new Error('Elsci response body was empty');
  }

  try {
    return JSON.parse(trimmed) as { items?: unknown };
  } catch {
    const firstBraceIndex = trimmed.indexOf('{');
    const lastBraceIndex = trimmed.lastIndexOf('}');
    if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
      const candidate = trimmed.slice(firstBraceIndex, lastBraceIndex + 1);
      try {
        return JSON.parse(candidate) as { items?: unknown };
      } catch {
        // Fall through to detailed error below.
      }
    }

    const preview = trimmed.slice(0, 160).replace(/\s+/g, ' ');
    throw new Error(`Elsci response was not valid JSON (preview: ${preview})`);
  }
};

const cleanWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeBaseUrl = (value?: string): string => {
  const base = (value || process.env.ELSCI_LIGHT_NOVELS_BASE_URL || DEFAULT_ELSCI_BASE_URL).trim();
  return base.replace(/\/+$/, '') || DEFAULT_ELSCI_BASE_URL;
};

const normalizePath = (value: string, ensureTrailingSlash: boolean): string => {
  const raw = cleanWhitespace(value || '/').replace(/\\/g, '/');
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const withSlash = ensureTrailingSlash
    ? withLeadingSlash.endsWith('/')
      ? withLeadingSlash
      : `${withLeadingSlash}/`
    : withLeadingSlash.endsWith('/')
      ? withLeadingSlash.slice(0, -1)
      : withLeadingSlash;

  const segments = withSlash
    .split('/')
    .map((segment) => {
      if (!segment) return '';
      const decoded = safeDecode(segment);
      return encodeURIComponent(decoded);
    });
  return segments.join('/') || '/';
};

const normalizeRootPath = (value?: string): string =>
  normalizePath(value || process.env.ELSCI_LIGHT_NOVELS_ROOT_PATH || DEFAULT_ELSCI_ROOT_PATH, true);

const normalizeFileHref = (value: string): string => normalizePath(value, false);

const toAbsoluteUrl = (href: string, baseUrl: string): string => new URL(href, `${baseUrl}/`).toString();

const isBookFileHref = (decodedHref: string): boolean => {
  const lower = decodedHref.toLowerCase();
  return lower.endsWith('.epub') || lower.endsWith('.pdf');
};

const inferFormatFromHref = (decodedHref: string): 'EPUB' | 'PDF' | null => {
  const lower = decodedHref.toLowerCase();
  if (lower.endsWith('.epub')) return 'EPUB';
  if (lower.endsWith('.pdf')) return 'PDF';
  return null;
};

const buildRegex = (pattern?: string): RegExp | null => {
  if (!pattern || !pattern.trim()) return null;
  try {
    return new RegExp(pattern.trim(), 'i');
  } catch {
    return null;
  }
};

const normalizeKey = (value: string): string =>
  cleanWhitespace(value)
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const cleanTitle = (fileName: string, fallbackSeries: string): string => {
  const withoutExtension = fileName.replace(/\.(epub|pdf)$/i, '');
  const clean = cleanWhitespace(
    withoutExtension
      .replace(/[._]/g, ' ')
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/\b(epub|pdf)\b/gi, ' '),
  );
  return clean || fallbackSeries;
};

const parseCatalogItems = (items: unknown): ElsciCatalogItem[] => {
  if (!Array.isArray(items)) return [];
  const parsed: ElsciCatalogItem[] = [];
  for (const raw of items as H5aiItemResponse[]) {
    const href = typeof raw.href === 'string' ? raw.href : '';
    if (!href) continue;
    const timeValue = typeof raw.time === 'number' && Number.isFinite(raw.time) ? raw.time : null;
    const sizeValue = typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : null;
    parsed.push({ href, time: timeValue, size: sizeValue });
  }
  return parsed;
};

const requestElsciCatalogViaDirectPost = async (options: {
  baseUrl: string;
  rootPath: string;
  timeoutMs: number;
  cookieHeader?: string;
}): Promise<ElsciCatalogItem[]> => {
  const response = await axios.post(
    `${options.baseUrl}/?`,
    buildElsciCatalogRequestBody(options.rootPath),
    {
      timeout: options.timeoutMs,
      headers: buildElsciRequestHeaders(options.baseUrl, options.cookieHeader),
      responseType: 'json',
      validateStatus: (status) => status >= 200 && status < 400,
    },
  );

  return parseCatalogItems(response.data?.items);
};

const requestElsciCatalogViaDirectFormPost = async (options: {
  baseUrl: string;
  rootPath: string;
  timeoutMs: number;
  cookieHeader?: string;
}): Promise<ElsciCatalogItem[]> => {
  const response = await axios.post(
    `${options.baseUrl}/?`,
    buildElsciCatalogFormBody(options.rootPath),
    {
      timeout: options.timeoutMs,
      headers: {
        ...buildElsciRequestHeaders(options.baseUrl, options.cookieHeader),
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      responseType: 'json',
      validateStatus: (status) => status >= 200 && status < 400,
    },
  );

  return parseCatalogItems(response.data?.items);
};

const requestElsciCatalogViaCookieRetry = async (options: {
  baseUrl: string;
  rootPath: string;
  timeoutMs: number;
}): Promise<ElsciCatalogItem[]> => {
  const preflight = await axios.get(`${options.baseUrl}/`, {
    timeout: options.timeoutMs,
    headers: {
      'user-agent': DEFAULT_HEADERS['user-agent'],
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': DEFAULT_HEADERS['accept-language'],
      referer: `${options.baseUrl}/`,
      origin: options.baseUrl,
    },
    validateStatus: (status) => status >= 200 && status < 500,
  });

  const cookieHeader = extractCookieHeader(preflight.headers['set-cookie']);
  if (!cookieHeader) {
    throw new Error('Elsci preflight did not provide a session cookie');
  }

  try {
    return await requestElsciCatalogViaDirectPost({
      baseUrl: options.baseUrl,
      rootPath: options.rootPath,
      timeoutMs: options.timeoutMs,
      cookieHeader,
    });
  } catch {
    return requestElsciCatalogViaDirectFormPost({
      baseUrl: options.baseUrl,
      rootPath: options.rootPath,
      timeoutMs: options.timeoutMs,
      cookieHeader,
    });
  }
};

const requestElsciCatalogViaFlareSolverr = async (options: {
  baseUrl: string;
  rootPath: string;
  timeoutMs: number;
}): Promise<ElsciCatalogItem[]> => {
  const flaresolverrUrl = getFlareSolverrUrl();

  const response = await axios.post<FlareSolverrHttpResponse>(
    `${flaresolverrUrl}/v1`,
    {
      cmd: 'request.post',
      session: ELSCI_FLARESOLVERR_SESSION,
      maxTimeout: options.timeoutMs,
      url: `${options.baseUrl}/?`,
      postData: buildElsciCatalogFormBody(options.rootPath),
    },
    {
      timeout: Math.max(65_000, options.timeoutMs + 5_000),
      validateStatus: () => true,
    },
  );

  const data = response.data;
  if (!data || data.status !== 'ok' || !data.solution) {
    throw new Error(data?.message || 'FlareSolverr request failed');
  }

  const status = data.solution.status;
  if (typeof status !== 'number' || status < 200 || status >= 400) {
    throw new Error(`FlareSolverr returned non-success HTTP status ${status ?? 'unknown'}`);
  }

  const parsedBody = parseElsciResponseBody(data.solution.response || '');

  return parseCatalogItems(parsedBody.items);
};

export const pickPreferredElsciFile = (
  current: ElsciLightNovelFile,
  candidate: ElsciLightNovelFile,
  preference: ElsciRequestedFormat,
): ElsciLightNovelFile => {
  const rank = (entry: ElsciLightNovelFile): number => {
    const formatBonus =
      preference === 'any'
        ? entry.format === 'EPUB'
          ? 2
          : 1
        : preference === 'epub'
          ? entry.format === 'EPUB'
            ? 4
            : 1
          : entry.format === 'PDF'
            ? 4
            : 1;
    const modified = entry.modifiedAtMs || 0;
    const size = entry.sizeBytes || 0;
    return formatBonus * 1_000_000_000_000 + modified * 1000 + size;
  };

  return rank(candidate) > rank(current) ? candidate : current;
};

export const selectElsciLightNovelFiles = (
  catalogItems: ElsciCatalogItem[],
  options: {
    baseUrl: string;
    rootPath: string;
    maxFiles: number;
    formatPreference: ElsciRequestedFormat;
    includePattern?: string;
    excludePattern?: string;
  },
): ElsciLightNovelFile[] => {
  const rootDecoded = safeDecode(options.rootPath);
  const includeRegex = buildRegex(options.includePattern);
  const excludeRegex = buildRegex(options.excludePattern);
  const selectedByKey = new Map<string, ElsciLightNovelFile>();

  for (const item of catalogItems) {
    const normalizedHref = normalizeFileHref(item.href);
    const decodedHref = safeDecode(normalizedHref);
    if (!decodedHref.startsWith(rootDecoded)) continue;
    if (!isBookFileHref(decodedHref)) continue;
    const format = inferFormatFromHref(decodedHref);
    if (!format) continue;

    const relative = decodedHref.slice(rootDecoded.length).replace(/^\/+/, '');
    if (!relative) continue;

    const parts = relative.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    const fileName = parts[parts.length - 1] || '';
    if (!fileName) continue;

    const series = cleanWhitespace(parts[0] || 'Unknown Series');
    const title = cleanTitle(fileName, series);
    const searchable = `${series} ${title}`;
    const rawSearchable = `${series} ${fileName} ${relative}`;
    if (includeRegex && !includeRegex.test(searchable) && !includeRegex.test(rawSearchable)) continue;
    if (excludeRegex && (excludeRegex.test(searchable) || excludeRegex.test(rawSearchable))) continue;

    const entry: ElsciLightNovelFile = {
      href: normalizedHref,
      absoluteUrl: toAbsoluteUrl(normalizedHref, options.baseUrl),
      title,
      series,
      fileName,
      format,
      sizeBytes: item.size,
      modifiedAtMs: item.time,
    };

    const key = `${normalizeKey(series)}::${normalizeKey(title)}`;
    const existing = selectedByKey.get(key);
    if (!existing) {
      selectedByKey.set(key, entry);
      continue;
    }
    selectedByKey.set(key, pickPreferredElsciFile(existing, entry, options.formatPreference));
  }

  return Array.from(selectedByKey.values())
    .sort((a, b) => {
      const modifiedA = a.modifiedAtMs || 0;
      const modifiedB = b.modifiedAtMs || 0;
      if (modifiedA !== modifiedB) return modifiedB - modifiedA;
      const sizeA = a.sizeBytes || 0;
      const sizeB = b.sizeBytes || 0;
      return sizeB - sizeA;
    })
    .slice(0, options.maxFiles);
};

export const fetchElsciCatalogItems = async (options: {
  baseUrl?: string;
  rootPath?: string;
  timeoutMs?: number;
  skipCache?: boolean;
} = {}): Promise<{ baseUrl: string; rootPath: string; items: ElsciCatalogItem[] }> => {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const rootPath = normalizeRootPath(options.rootPath);
  const cacheKey = `${baseUrl}::${rootPath}`;
  
  // Check cache first
  if (!options.skipCache) {
    const cached = catalogCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[Elsci] Using cached catalog (${cached.items.length} items)`);
      return { baseUrl, rootPath, items: cached.items };
    }
  }

  const timeoutMs =
    Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
      ? Math.min(options.timeoutMs as number, 120_000)
      : Number.parseInt(process.env.ELSCI_LIGHT_NOVELS_REQUEST_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10) ||
        DEFAULT_TIMEOUT_MS;

  const result = await retryWithBackoff(async () => {
    try {
      const items = await requestElsciCatalogViaDirectPost({
        baseUrl,
        rootPath,
        timeoutMs,
      });

      return { baseUrl, rootPath, items };
    } catch (error) {
      const statusCode = getAxiosStatusCode(error);

      if (!isAccessChallengeStatus(statusCode)) {
        throw error;
      }

      const fallbackErrors: string[] = [];

      try {
        const items = await requestElsciCatalogViaCookieRetry({
          baseUrl,
          rootPath,
          timeoutMs,
        });

        return { baseUrl, rootPath, items };
      } catch (cookieRetryError) {
        fallbackErrors.push(`cookie-retry: ${toErrorMessage(cookieRetryError)}`);
      }

      try {
        const items = await requestElsciCatalogViaFlareSolverr({
          baseUrl,
          rootPath,
          timeoutMs,
        });

        return { baseUrl, rootPath, items };
      } catch (solverError) {
        fallbackErrors.push(`flaresolverr: ${toErrorMessage(solverError)}`);
      }

      const detail = fallbackErrors.length > 0 ? ` ${fallbackErrors.join(' | ')}` : '';
      throw new RetryableError(`Elsci catalog request blocked with status ${statusCode}.${detail}`);
    }
  }, {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 15000,
    onRetry: (attempt, error) => {
      console.warn(`[Elsci] Catalog fetch retry ${attempt}: ${error.message}`);
    },
  });

  // Cache the result
  catalogCache.set(cacheKey, { items: result.items, timestamp: Date.now() });
  
  return result;
};

export const discoverElsciLightNovelFiles = async (
  options: DiscoverElsciLightNovelOptions = {},
): Promise<ElsciLightNovelFile[]> => {
  const maxFiles =
    Number.isFinite(options.maxFiles) && (options.maxFiles as number) > 0
      ? Math.min(options.maxFiles as number, 2_000)
      : 200;
  const formatPreference = options.formatPreference || 'epub';

  const catalog = await fetchElsciCatalogItems({
    baseUrl: options.baseUrl,
    rootPath: options.rootPath,
    timeoutMs: options.timeoutMs,
  });

  return selectElsciLightNovelFiles(catalog.items, {
    baseUrl: catalog.baseUrl,
    rootPath: catalog.rootPath,
    maxFiles,
    formatPreference,
    includePattern: options.includePattern,
    excludePattern: options.excludePattern,
  });
};

export const fetchElsciLightNovelFileStream = async (
  href: string,
  options: { baseUrl?: string; timeoutMs?: number; onProgress?: (downloaded: number, total?: number) => void } = {},
) => {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const normalizedHref = normalizeFileHref(href);
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
      ? Math.min(options.timeoutMs as number, 120_000)
      : Number.parseInt(process.env.ELSCI_LIGHT_NOVELS_REQUEST_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10) ||
        DEFAULT_TIMEOUT_MS;

  const url = toAbsoluteUrl(normalizedHref, baseUrl);
  
  return retryWithBackoff(async () => {
    const downloadWithHeaders = async (headers: Record<string, string>) => {
      const response = await axios.get(url, {
        timeout: timeoutMs,
        responseType: 'stream',
        headers,
        validateStatus: (status) => status >= 200 && status < 400,
        onDownloadProgress: (progressEvent) => {
          options.onProgress?.(progressEvent.loaded, progressEvent.total);
        },
      });

      return {
        stream: response.data as NodeJS.ReadableStream,
        headers: response.headers as Record<string, string | string[] | undefined>,
        url,
        size: response.headers['content-length'] ? parseInt(response.headers['content-length'], 10) : undefined,
      };
    };

    try {
      return await downloadWithHeaders(buildElsciFileRequestHeaders(baseUrl));
    } catch (error) {
      const statusCode = getAxiosStatusCode(error);
      if (!isAccessChallengeStatus(statusCode)) {
        throw error;
      }

      const fallbackErrors: string[] = [];

      // Fallback 1: browser-style preflight cookie retry
      try {
        const preflight = await axios.get(`${baseUrl}/`, {
          timeout: timeoutMs,
          headers: {
            'user-agent': DEFAULT_HEADERS['user-agent'],
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': DEFAULT_HEADERS['accept-language'],
            referer: `${baseUrl}/`,
            origin: baseUrl,
          },
          validateStatus: (status) => status >= 200 && status < 500,
        });

        const cookieHeader = extractCookieHeader(preflight.headers['set-cookie']);
        if (!cookieHeader) {
          throw new Error('No session cookie from Elsci preflight');
        }

        return await downloadWithHeaders(
          buildElsciFileRequestHeaders(baseUrl, { cookieHeader }),
        );
      } catch (cookieRetryError) {
        fallbackErrors.push(`cookie-retry: ${toErrorMessage(cookieRetryError)}`);
      }

      // Fallback 2: solve challenge via FlareSolverr and reuse cookies/user-agent
      try {
        const solvedAccess = await resolveElsciAccessViaFlareSolverr({ baseUrl, timeoutMs });
        return await downloadWithHeaders(
          buildElsciFileRequestHeaders(baseUrl, solvedAccess),
        );
      } catch (solverError) {
        fallbackErrors.push(`flaresolverr: ${toErrorMessage(solverError)}`);
      }

      const detail = fallbackErrors.length > 0 ? ` ${fallbackErrors.join(' | ')}` : '';
      throw new RetryableError(`Elsci file request blocked with status ${statusCode}.${detail}`);
    }
  }, {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    onRetry: (attempt, error) => {
      console.warn(`[Elsci] File download retry ${attempt} for ${href}: ${error.message}`);
    },
  });
};
