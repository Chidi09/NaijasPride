import axios from 'axios';
import * as cheerio from 'cheerio';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { FlareSolverrFetcher } from './sources/fetch/flaresolverr.fetcher';
import { HealthMonitorService } from '../../shared/services/health-monitor.service';
import { retryWithBackoff, RetryableError, isRetryableStatus } from '../../shared/utils/retry';

const DEFAULT_1337X_BASE_URL = 'https://www.1377x.to';

// Mirror rotation list
const MIRROR_URLS = [
  'https://www.1377x.to',
  'https://1337x.st',
  'https://x1337x.ws',
  'https://x1337x.eu',
  'https://x1337x.se',
  'https://1337x.is',
  'https://1337x.gd',
].filter(Boolean);

export type MustHaveBook = {
  title: string;
  author: string;
  year?: number;
  genre?: string[];
};

export type ExternalBookTarget = MustHaveBook & {
  source: 'must-have' | 'google-trending';
  description?: string;
  coverUrl?: string;
  language?: string;
  publisher?: string;
  isbn?: string;
};

export type BookTorrentListingCandidate = {
  title: string;
  detailUrl: string;
  seeds: number;
  leeches: number;
  isAudiobook: boolean;
  isLikelyVideo: boolean;
  format: 'EPUB' | 'PDF' | 'MOBI' | 'AZW' | 'UNKNOWN';
  // For Anna's Archive results: direct download URL (no magnet link)
  downloadUrl?: string;
};

export type BookTorrentMatch = {
  target: ExternalBookTarget;
  listing: BookTorrentListingCandidate;
  magnetLink: string;
  infoHash: string | null;
};

export type AutoLibraryRunOptions = {
  includeMustHaves?: boolean;
  includeTrending?: boolean;
  maxTargets?: number;
  maxMatches?: number;
  minSeeders?: number;
  ingest?: boolean;
  dryRun?: boolean;
};

export type AutoLibraryRunSummary = {
  sourceBaseUrl: string;
  includeMustHaves: boolean;
  includeTrending: boolean;
  ingest: boolean;
  dryRun: boolean;
  targets: number;
  matched: number;
  created: number;
  updated: number;
  skippedExisting: number;
  filteredAudio: number;
  failed: number;
  errors: string[];
  items: Array<{
    title: string;
    author: string;
    source: string;
    seeds: number;
    format: string;
    detailUrl: string;
    infoHash: string | null;
  }>;
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const toInt = (value: string): number => {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const cleanWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const normalizeTitle = (value: string): string =>
  cleanWhitespace(value)
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeForKey = (value: string): string =>
  normalizeTitle(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parseBookYear = (value?: string): number | undefined => {
  if (!value) return undefined;
  const match = value.match(/\b(19\d{2}|20\d{2})\b/);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1] || '', 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const detectFormat = (title: string): BookTorrentListingCandidate['format'] => {
  const lower = title.toLowerCase();
  if (lower.includes('epub')) return 'EPUB';
  if (lower.includes('pdf')) return 'PDF';
  if (lower.includes('mobi')) return 'MOBI';
  if (lower.includes('azw')) return 'AZW';
  return 'UNKNOWN';
};

const isAudiobookTitle = (title: string): boolean => {
  const lower = title.toLowerCase();
  return (
    lower.includes('audiobook') ||
    lower.includes('audio book') ||
    lower.includes('.mp3') ||
    lower.includes('.m4b') ||
    lower.includes('narrated') ||
    lower.includes('audible')
  );
};

const isLikelyVideoRelease = (title: string): boolean => {
  const lower = title.toLowerCase();
  return (
    /\b(2160p|1080p|720p|480p|x264|x265|h264|h265|webrip|web[- ]dl|bluray|brrip|hdrip|dvdrip|hdtv|ac3|aac|ddp|10bit|hevc|cam|ts)\b/i.test(lower) ||
    lower.includes(' yts ') ||
    lower.includes(' xvid ') ||
    // JAV / AV release codes: e.g. MIAA-030, SSIS-123, IPX-456, PRED-789
    /\b[a-z]{2,5}-\d{3,5}\b/i.test(title)
  );
};

const splitTokens = (value: string): string[] =>
  normalizeForKey(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

const hasAuthorSignal = (title: string, author: string): boolean => {
  const titleTokens = new Set(splitTokens(title));
  const authorTokens = splitTokens(author);
  if (!authorTokens.length) return false;
  return authorTokens.some((token) => titleTokens.has(token));
};

const hasTitleSignal = (candidateTitle: string, targetTitle: string): boolean => {
  const candidateTokens = new Set(splitTokens(candidateTitle));
  const targetTokens = splitTokens(targetTitle).filter((token) => token.length >= 4);
  if (!targetTokens.length) return false;
  const overlap = targetTokens.filter((token) => candidateTokens.has(token));
  return overlap.length >= Math.max(1, Math.floor(targetTokens.length / 2));
};

// Stricter title match for UNKNOWN-format torrents: requires majority of
// longer tokens (≥5 chars) to appear in the candidate title.
const hasStrictTitleSignal = (candidateTitle: string, targetTitle: string): boolean => {
  const candidateTokens = new Set(splitTokens(candidateTitle));
  const targetTokens = splitTokens(targetTitle).filter((token) => token.length >= 5);
  if (!targetTokens.length) return hasTitleSignal(candidateTitle, targetTitle);
  const overlap = targetTokens.filter((token) => candidateTokens.has(token));
  return overlap.length >= Math.ceil(targetTokens.length * 0.6); // 60% of long tokens must match
};

export const parse1337xBookListingHtml = (
  html: string,
  baseUrl: string,
): BookTorrentListingCandidate[] => {
  const $ = cheerio.load(html);
  const rows = $('table.table-list tbody tr');
  const results: BookTorrentListingCandidate[] = [];
  const seen = new Set<string>();

  rows.each((_, row) => {
    const links = $(row).find('td.name a');
    const titleAnchor = links.last();
    const title = normalizeTitle(titleAnchor.text().trim());
    const detailHref = titleAnchor.attr('href');
    if (!title || !detailHref) return;

    let detailUrl = '';
    try {
      detailUrl = new URL(detailHref, baseUrl).toString();
    } catch {
      return;
    }

    if (seen.has(detailUrl)) return;
    seen.add(detailUrl);

    results.push({
      title,
      detailUrl,
      seeds: toInt($(row).find('td.seeds').first().text()),
      leeches: toInt($(row).find('td.leeches').first().text()),
      isAudiobook: isAudiobookTitle(title),
      isLikelyVideo: isLikelyVideoRelease(title),
      format: detectFormat(title),
    });
  });

  return results;
};

// Parse Anna's Archive search result HTML.
// Result items are <div class="h-[125px]"> or <a href="/md5/..."> blocks.
// We look for <a href="/md5/..."> links and extract metadata from surrounding text.
export const parseAnnasArchiveHtml = (
  html: string,
  baseUrl: string,
  ext: 'epub' | 'pdf',
): BookTorrentListingCandidate[] => {
  const $ = cheerio.load(html);
  const results: BookTorrentListingCandidate[] = [];
  const seen = new Set<string>();

  // Each search result is a <div> containing an <a href="/md5/...">
  // The structure varies but md5 links are stable
  $('a[href^="/md5/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    // Extract md5 hash from the href
    const md5Match = href.match(/^\/md5\/([a-f0-9]+)$/i);
    if (!md5Match || !md5Match[1]) return;
    const md5 = md5Match[1].toLowerCase();

    if (seen.has(md5)) return;
    seen.add(md5);

    const downloadUrl = `${baseUrl}/md5/${md5}`;

    // Extract text content from the link or its container
    const container = $(el).closest('div');
    const rawText = (container.text() || $(el).text()).replace(/\s+/g, ' ').trim();

    // Try to extract title from the link text or the h3/strong inside the container
    let candidateTitle = (container.find('h3, strong, [class*="title"]').first().text() || $(el).text()).trim();
    if (!candidateTitle) candidateTitle = rawText.slice(0, 100);

    candidateTitle = normalizeTitle(candidateTitle);
    if (!candidateTitle) return;

    const format: BookTorrentListingCandidate['format'] = ext === 'epub' ? 'EPUB' : 'PDF';

    results.push({
      title: candidateTitle,
      detailUrl: downloadUrl,
      seeds: 999, // Anna's Archive is a library, not a torrent — use high synthetic seeder count
      leeches: 0,
      isAudiobook: isAudiobookTitle(candidateTitle) || rawText.toLowerCase().includes('audiobook'),
      isLikelyVideo: isLikelyVideoRelease(candidateTitle),
      format,
      downloadUrl,
    });
  });

  return results;
};

export const parse1337xBookDetailHtml = (html: string): { magnetLink: string | null } => {
  const $ = cheerio.load(html);
  const magnetLink =
    $('a[href^="magnet:?xt=urn:btih:"]').first().attr('href') ||
    html.match(/magnet:\?xt=urn:btih:[^"'\s<]+/i)?.[0] ||
    null;
  return { magnetLink };
};

const extractInfoHash = (magnet: string): string | null => {
  const match = magnet.match(/btih:([a-fA-F0-9]+)/);
  return match?.[1]?.toUpperCase() || null;
};

const scoreListing = (entry: BookTorrentListingCandidate): number => {
  let score = 0;
  if (entry.format === 'EPUB') score += 120;
  if (entry.format === 'PDF') score += 100;
  if (entry.format === 'MOBI' || entry.format === 'AZW') score += 70;
  score += Math.min(entry.seeds, 500);
  if (entry.leeches > 0) score += Math.min(entry.leeches, 200) * 0.1;
  if (entry.isAudiobook) score -= 500;
  return score;
};

export class AutoLibraryDiscoveryService {
  private readonly flaresolverr = new FlareSolverrFetcher();
  private readonly sourceBaseUrl: string;
  private readonly healthMonitor: HealthMonitorService;
  private mirrorIndex = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Pick<Console, 'info' | 'warn' | 'error'> = console,
  ) {
    this.sourceBaseUrl = (process.env.BOOK_AUTO_LIBRARY_SOURCE_URL || DEFAULT_1337X_BASE_URL).trim().replace(/\/+$/, '');
    this.healthMonitor = new HealthMonitorService({
      windowMs: 300000, // 5 minutes
      failureThreshold: 3,
      successThreshold: 2,
      recoveryMs: 600000, // 10 minutes
    });
  }

  async loadMustHaves(): Promise<MustHaveBook[]> {
    const candidates = [
      path.resolve(process.cwd(), 'apps/api/src/modules/books/data/must-haves.json'),
      path.resolve(process.cwd(), 'src/modules/books/data/must-haves.json'),
      path.resolve(__dirname, '../../src/modules/books/data/must-haves.json'),
      path.resolve(__dirname, 'data/must-haves.json'),
    ];

    let filePath: string | null = null;
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        filePath = candidate;
        break;
      } catch {
        // try next candidate
      }
    }

    if (!filePath) {
      throw new Error('Auto-Library must-haves file was not found');
    }

    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as MustHaveBook[];
    return parsed
      .map((entry) => ({
        title: cleanWhitespace(entry.title || ''),
        author: cleanWhitespace(entry.author || ''),
        year: entry.year,
        genre: Array.isArray(entry.genre) ? entry.genre.filter(Boolean).map((g) => cleanWhitespace(g)) : [],
      }))
      .filter((entry) => !!entry.title && !!entry.author);
  }

  async fetchGoogleTrendingBooks(maxResults: number): Promise<ExternalBookTarget[]> {
    const queries = (process.env.BOOK_AUTO_LIBRARY_GOOGLE_QUERIES || 'subject:fiction bestseller,subject:literary fiction')
      .split(',')
      .map((q) => q.trim())
      .filter(Boolean);

    const results: ExternalBookTarget[] = [];
    const seen = new Set<string>();

    for (const query of queries) {
      if (results.length >= maxResults) break;
      try {
        const response = await axios.get('https://www.googleapis.com/books/v1/volumes', {
          params: {
            q: query,
            orderBy: 'relevance',
            printType: 'books',
            maxResults: Math.min(maxResults, 40),
            langRestrict: 'en',
          },
          timeout: 20_000,
        });

        const items = Array.isArray(response.data?.items) ? response.data.items : [];
        for (const item of items) {
          if (results.length >= maxResults) break;
          const volume = item?.volumeInfo || {};
          const title = cleanWhitespace(String(volume.title || ''));
          const author = cleanWhitespace(String((volume.authors || [])[0] || 'Unknown'));
          if (!title || !author) continue;

          const key = `${normalizeForKey(title)}::${normalizeForKey(author)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const isbn = Array.isArray(volume.industryIdentifiers)
            ? String(volume.industryIdentifiers.find((id: any) => id?.identifier)?.identifier || '')
            : '';

          results.push({
            title,
            author,
            year: parseBookYear(String(volume.publishedDate || '')),
            genre: Array.isArray(volume.categories) ? volume.categories.slice(0, 3) : [],
            source: 'google-trending',
            description: cleanWhitespace(String(volume.description || '')) || undefined,
            coverUrl: volume.imageLinks?.thumbnail || volume.imageLinks?.smallThumbnail || undefined,
            language: volume.language ? String(volume.language).toUpperCase() : undefined,
            publisher: cleanWhitespace(String(volume.publisher || '')) || undefined,
            isbn: isbn || undefined,
          });
        }
      } catch (error) {
        this.logger.warn(`[AutoLibrary] Google Books query failed for "${query}": ${toErrorMessage(error)}`);
      }
    }

    return results;
  }

  async discoverAndSync(options: AutoLibraryRunOptions = {}): Promise<AutoLibraryRunSummary> {
    const includeMustHaves = options.includeMustHaves ?? true;
    const includeTrending = options.includeTrending ?? true;
    const ingest = options.ingest ?? false;
    const dryRun = options.dryRun ?? false;
    const maxTargets = Number.isFinite(options.maxTargets) && (options.maxTargets as number) > 0
      ? Math.min(options.maxTargets as number, 60)
      : 24;
    const maxMatches = Number.isFinite(options.maxMatches) && (options.maxMatches as number) > 0
      ? Math.min(options.maxMatches as number, 25)
      : 8;
    const minSeeders = Number.isFinite(options.minSeeders) && (options.minSeeders as number) >= 0
      ? options.minSeeders as number
      : 1;

    const summary: AutoLibraryRunSummary = {
      sourceBaseUrl: this.sourceBaseUrl,
      includeMustHaves,
      includeTrending,
      ingest,
      dryRun,
      targets: 0,
      matched: 0,
      created: 0,
      updated: 0,
      skippedExisting: 0,
      filteredAudio: 0,
      failed: 0,
      errors: [],
      items: [],
    };

    const mustHaves = includeMustHaves ? await this.loadMustHaves() : [];
    const trending = includeTrending ? await this.fetchGoogleTrendingBooks(maxTargets) : [];

    const combined: ExternalBookTarget[] = [
      ...mustHaves.map((entry) => ({ ...entry, source: 'must-have' as const })),
      ...trending,
    ];

    const deduped: ExternalBookTarget[] = [];
    const seen = new Set<string>();
    for (const entry of combined) {
      const key = `${normalizeForKey(entry.title)}::${normalizeForKey(entry.author)}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(entry);
      if (deduped.length >= maxTargets) break;
    }

    summary.targets = deduped.length;

    const matches: BookTorrentMatch[] = [];
    for (const target of deduped) {
      if (matches.length >= maxMatches) break;

      try {
        // ── Primary: Anna's Archive (works even when VPS IP is banned by 1337x) ──
        let listing = await this.searchAnnasArchive(target.title, target.author);
        let source = "Anna's Archive";

        // ── Fallback: 1337x (append "book" to bias results toward book torrents) ──
        if (listing.length === 0) {
          this.logger.info(`[AutoLibrary] "${target.title}" — Anna's Archive returned 0, falling back to 1337x`);
          const query = `${target.title} ${target.author} book`;
          listing = await this.search1337xByQuery(query);
          source = '1337x';
        }

        this.logger.info(`[AutoLibrary] "${target.title}" — raw results: ${listing.length} (source: ${source})`);
        if (listing.length > 0) {
          this.logger.info(`[AutoLibrary] "${target.title}" — sample titles: ${listing.slice(0, 5).map(e => `"${e.title}" (video=${e.isLikelyVideo},fmt=${e.format})`).join(' | ')}`);
        }

        const nonAudio = listing.filter((entry) => {
          if (!entry.isAudiobook) return true;
          summary.filteredAudio += 1;
          return false;
        });
        this.logger.info(`[AutoLibrary] "${target.title}" — after audio filter: ${nonAudio.length}`);

        const likelyBooks = nonAudio.filter((entry) => {
          if (entry.isLikelyVideo) return false;
          if (entry.format !== 'UNKNOWN') return true;
          // For UNKNOWN format: require a strong title match AND at least one author token.
          return hasStrictTitleSignal(entry.title, target.title) && hasAuthorSignal(entry.title, target.author);
        });
        this.logger.info(`[AutoLibrary] "${target.title}" — after book filter: ${likelyBooks.length}`);

        const seeded = likelyBooks.filter((entry) => entry.seeds >= minSeeders);
        this.logger.info(`[AutoLibrary] "${target.title}" — after seeder filter (>=${minSeeders}): ${seeded.length}`);

        const top = seeded.sort((a, b) => scoreListing(b) - scoreListing(a))[0];
        if (!top) continue;

        this.logger.info(`[AutoLibrary] "${target.title}" — best match: "${top.title}" (seeds=${top.seeds}, format=${top.format})`);

        // Anna's Archive results have a direct downloadUrl — no magnet/detail page needed.
        if (top.downloadUrl) {
          matches.push({
            target,
            listing: top,
            magnetLink: top.downloadUrl, // store the download URL in magnetLink field (reused for downloadUrl below)
            infoHash: null,
          });
          continue;
        }

        // 1337x path: fetch detail page to get magnet link
        const detailHtml = await this.fetchHtml(top.detailUrl, 'book-auto-library');
        const detail = parse1337xBookDetailHtml(detailHtml);
        if (!detail.magnetLink) {
          this.logger.warn(`[AutoLibrary] "${target.title}" — no magnet link found on detail page: ${top.detailUrl}`);
          continue;
        }

        matches.push({
          target,
          listing: top,
          magnetLink: detail.magnetLink,
          infoHash: extractInfoHash(detail.magnetLink),
        });
      } catch (error) {
        summary.failed += 1;
        summary.errors.push(`${target.title} (${target.author}): ${toErrorMessage(error)}`);
        this.logger.error(`[AutoLibrary] "${target.title}" failed: ${toErrorMessage(error)}`);
      }
    }

    summary.matched = matches.length;

    if (ingest) {
      for (const match of matches) {
        const slug = `${match.target.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${match.target.year || new Date().getFullYear()}`;
        const existing = await this.prisma.book.findUnique({
          where: { slug },
          select: { id: true, status: true },
        });
        if (existing && existing.status === 'active') {
          summary.skippedExisting += 1;
          continue;
        }

        if (dryRun) {
          summary.created += existing ? 0 : 1;
          summary.updated += existing ? 1 : 0;
          continue;
        }

        const payload = {
          title: match.target.title,
          slug,
          author: match.target.author,
          description: match.target.description || null,
          year: match.target.year || new Date().getFullYear(),
          isbn: match.target.isbn || null,
          coverUrl: match.target.coverUrl || null,
          downloadUrl: match.magnetLink,
          format: match.listing.format === 'UNKNOWN' ? 'EPUB' : match.listing.format,
          genre: match.target.genre && match.target.genre.length > 0 ? match.target.genre : ['General'],
          language: match.target.language || 'EN',
          publisher: match.target.publisher || (match.listing.downloadUrl ? "Anna's Archive" : 'AutoLibrary'),
          status: 'active' as const,
        };

        await this.prisma.book.upsert({
          where: { slug },
          create: payload,
          update: {
            author: payload.author,
            description: payload.description,
            year: payload.year,
            isbn: payload.isbn,
            coverUrl: payload.coverUrl,
            downloadUrl: payload.downloadUrl,
            format: payload.format,
            genre: payload.genre,
            language: payload.language,
            publisher: payload.publisher,
            status: payload.status,
          },
        });

        if (existing) {
          summary.updated += 1;
        } else {
          summary.created += 1;
        }
      }
    }

    summary.items = matches.map((match) => ({
      title: match.target.title,
      author: match.target.author,
      source: match.target.source,
      seeds: match.listing.seeds,
      format: match.listing.format,
      detailUrl: match.listing.detailUrl,
      infoHash: match.infoHash,
    }));

    this.logger.info({ summary }, '[AutoLibrary] Discovery run completed');
    return summary;
  }

  // ── Anna's Archive ──────────────────────────────────────────────────────────
  // Primary book source (replaces 1337x when VPS IP is banned).
  // Searches https://annas-archive.li/search?q=<title+author>&lang=en&ext=epub
  // and parses the HTML result list for title/author/md5/format.
  // Download URL is constructed as https://annas-archive.li/md5/<hash>.
  //
  // Note: annas-archive.org DNS fails from some VPS IPs. Use .li only.
  private readonly ANNAS_ARCHIVE_HOSTS = [
    'https://annas-archive.li',
    'https://annas-archive.se',
  ];

  // Rate-limit guard: wait between Anna's Archive requests to avoid 429/403
  private annasLastRequestAt = 0;
  private readonly ANNAS_MIN_INTERVAL_MS = 3000; // 3 seconds between requests

  private async annasThrottledGet(url: string): Promise<string | null> {
    const now = Date.now();
    const elapsed = now - this.annasLastRequestAt;
    if (elapsed < this.ANNAS_MIN_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, this.ANNAS_MIN_INTERVAL_MS - elapsed));
    }
    this.annasLastRequestAt = Date.now();

    const response = await axios.get<string>(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://annas-archive.li/',
      },
      timeout: 30_000,
      responseType: 'text',
      validateStatus: (s) => s < 500,
      maxRedirects: 5,
    });

    if (response.status === 403 || response.status === 429) {
      this.logger.warn(`[AutoLibrary] Anna's Archive rate-limited (HTTP ${response.status}) for ${url}`);
      // Back off an extra 5 seconds on rate-limit responses
      this.annasLastRequestAt = Date.now() + 5000;
      return null;
    }

    if (response.status !== 200 || !response.data) {
      this.logger.warn(`[AutoLibrary] Anna's Archive returned HTTP ${response.status} for ${url}`);
      return null;
    }

    return response.data as string;
  }

  async searchAnnasArchive(title: string, author: string): Promise<BookTorrentListingCandidate[]> {
    const query = encodeURIComponent(`${title} ${author}`.trim());
    const results: BookTorrentListingCandidate[] = [];

    for (const host of this.ANNAS_ARCHIVE_HOSTS) {
      try {
        // Try epub first, then pdf as fallback
        for (const ext of ['epub', 'pdf']) {
          const url = `${host}/search?q=${query}&lang=en&ext=${ext}&sort=`;
          this.logger.info(`[AutoLibrary] Anna's Archive search: ${url}`);

          const html = await this.annasThrottledGet(url).catch((err) => {
            this.logger.warn(`[AutoLibrary] Anna's Archive host ${host} failed: ${toErrorMessage(err)}`);
            return null;
          });

          if (!html) continue;

          const parsed = parseAnnasArchiveHtml(html, host, ext as 'epub' | 'pdf');
          this.logger.info(`[AutoLibrary] Anna's Archive (${ext}): ${parsed.length} results from ${host}`);
          results.push(...parsed);
        }

        if (results.length > 0) break; // got results from this host, stop
      } catch (err) {
        this.logger.warn(`[AutoLibrary] Anna's Archive host ${host} failed: ${toErrorMessage(err)}`);
      }
    }

    return results;
  }

  private async search1337xByQuery(query: string): Promise<BookTorrentListingCandidate[]> {
    const encoded = encodeURIComponent(query.trim());
    const url = `${this.sourceBaseUrl}/sort-search/${encoded}/seeders/desc/1/`;
    const html = await this.fetchHtml(url, 'book-auto-library');
    return parse1337xBookListingHtml(html, this.sourceBaseUrl);
  }

  private async fetchHtml(url: string, sourceId: string): Promise<string> {
    const serviceName = '1337x';
    
    if (!this.healthMonitor.shouldAttempt(serviceName)) {
      throw new Error(`1337x is currently unhealthy. Last failure: ${this.healthMonitor.getHealth(serviceName)?.lastChecked}`);
    }

    return retryWithBackoff(async () => {
      // Try current mirror
      const currentMirror = MIRROR_URLS[this.mirrorIndex] || this.sourceBaseUrl;
      const mirrorUrl = url.replace(this.sourceBaseUrl, currentMirror);
      
      try {
        const result = await this.attemptFetch(mirrorUrl, sourceId);
        this.healthMonitor.recordSuccess(serviceName);
        return result;
      } catch (error) {
        const status = error instanceof Error && 'status' in error 
          ? (error as any).status 
          : null;
        
        // Rotate mirror on failure
        this.mirrorIndex = (this.mirrorIndex + 1) % MIRROR_URLS.length;
        this.logger.warn(`[AutoLibrary] Mirror ${currentMirror} failed, trying ${MIRROR_URLS[this.mirrorIndex]}`);
        
        // Only retry on network errors or specific HTTP status codes
        if (!status || isRetryableStatus(status)) {
          throw new RetryableError(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
        }
        
        this.healthMonitor.recordFailure(serviceName);
        throw error;
      }
    }, {
      maxAttempts: 3,
      baseDelayMs: 2000,
      maxDelayMs: 10000,
      onRetry: (attempt, error, delay) => {
        this.logger.warn(`[AutoLibrary] Retry attempt ${attempt} after ${delay}ms: ${error.message}`);
      },
    });
  }

  private async attemptFetch(url: string, sourceId: string): Promise<string> {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    };

    // Try FlareSolverr first if available
    if (this.flaresolverr.canHandle()) {
      try {
        const response = await this.flaresolverr.get(url, {
          headers,
          timeoutMs: 60_000,
          sourceId,
        });
        if (response.status >= 200 && response.status < 300 && response.body.trim().length > 0) {
          return response.body;
        }
      } catch (error) {
        this.logger.warn(`[AutoLibrary] FlareSolverr failed for ${url}: ${toErrorMessage(error)}`);
      }
    }

    // Fallback to direct request
    const response = await axios.get<string>(url, {
      headers,
      timeout: 60_000,
      responseType: 'text',
      validateStatus: () => true,
    });
    
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(`HTTP ${response.status}`) as any;
      error.status = response.status;
      throw error;
    }
    
    if (typeof response.data !== 'string' || response.data.trim().length === 0) {
      throw new Error('Empty response');
    }

    // Check for Cloudflare challenge page
    if (response.data.includes('cf-browser-verification') || 
        response.data.includes('challenge-platform') ||
        response.data.includes('Just a moment...')) {
      const error = new Error('Cloudflare challenge detected') as any;
      error.status = 503;
      throw error;
    }

    return response.data;
  }
}
