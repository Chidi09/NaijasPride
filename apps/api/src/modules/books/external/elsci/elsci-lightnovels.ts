import axios from 'axios';

export type ElsciRequestedFormat = 'epub' | 'pdf' | 'any';

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

const DEFAULT_ELSCI_BASE_URL = 'https://server.elsci.one';
const DEFAULT_ELSCI_ROOT_PATH = '/Officially%20Translated%20Light%20Novels/';
const DEFAULT_TIMEOUT_MS = 60_000;
const H5AI_CATALOG_WHAT = 2;

const DEFAULT_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  accept: 'application/json,text/plain,*/*',
  'content-type': 'application/json;charset=utf-8',
} as const;

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
} = {}): Promise<{ baseUrl: string; rootPath: string; items: ElsciCatalogItem[] }> => {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const rootPath = normalizeRootPath(options.rootPath);
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
      ? Math.min(options.timeoutMs as number, 120_000)
      : Number.parseInt(process.env.ELSCI_LIGHT_NOVELS_REQUEST_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10) ||
        DEFAULT_TIMEOUT_MS;

  const endpoint = `${baseUrl}/?`;
  const response = await axios.post(
    endpoint,
    {
      action: 'get',
      items: {
        href: rootPath,
        what: H5AI_CATALOG_WHAT,
      },
    },
    {
      timeout: timeoutMs,
      headers: DEFAULT_HEADERS,
      responseType: 'json',
      validateStatus: (status) => status >= 200 && status < 400,
    },
  );

  const parsed = parseCatalogItems(response.data?.items);
  return {
    baseUrl,
    rootPath,
    items: parsed,
  };
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
  options: { baseUrl?: string; timeoutMs?: number } = {},
) => {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const normalizedHref = normalizeFileHref(href);
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
      ? Math.min(options.timeoutMs as number, 120_000)
      : Number.parseInt(process.env.ELSCI_LIGHT_NOVELS_REQUEST_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10) ||
        DEFAULT_TIMEOUT_MS;

  const url = toAbsoluteUrl(normalizedHref, baseUrl);
  const response = await axios.get(url, {
    timeout: timeoutMs,
    responseType: 'stream',
    headers: {
      'user-agent': DEFAULT_HEADERS['user-agent'],
      accept: '*/*',
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });

  return {
    stream: response.data as NodeJS.ReadableStream,
    headers: response.headers as Record<string, string | string[] | undefined>,
    url,
  };
};
