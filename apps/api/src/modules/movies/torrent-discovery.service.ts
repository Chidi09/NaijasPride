import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';
import { Genre, Quality } from '@naijaspride/types';
import { FlareSolverrFetcher } from '../books/sources/fetch/flaresolverr.fetcher';
import { CircuitBreaker } from '../books/sources/resilience/circuit-breaker';
import { QueueService } from '../../shared/services/queue.service';
import { MetadataService } from './metadata.service';
import { MoviesService } from './movies.service';

const DEFAULT_SOURCE_URL = 'https://www.1377x.to/popular-movies-week';
const DEFAULT_TIMEOUT_MS = 60_000;

type LoggerLike = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type TorrentDiscoveryConfig = {
  sourceUrl?: string;
  maxItemsPerRun?: number;
  requireApproval?: boolean;
  requestTimeoutMs?: number;
  dryRun?: boolean;
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
};

export type ListingCandidate = {
  rawTitle: string;
  normalizedTitle: string;
  year: number;
  detailUrl: string;
  seeds: number;
  leeches: number;
};

export type ResolvedTorrentCandidate = ListingCandidate & {
  detailTitle?: string;
  magnetLink: string;
  infoHash: string | null;
};

export type TorrentDiscoveryRunSummary = {
  sourceUrl: string;
  dryRun: boolean;
  requireApproval: boolean;
  skippedRunReason?: 'already-running' | 'circuit-open';
  discovered: number;
  resolved: number;
  created: number;
  queued: number;
  awaitingApproval: number;
  skippedExisting: number;
  failed: number;
  errors: string[];
};

const toNumber = (value: string): number => {
  const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const toMovieSlug = (title: string, year: number): string =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}`;

const toTitleCase = (value: string): string =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (/^[ivxlcdm]+$/i.test(word)) return word.toUpperCase();
      return `${word[0]?.toUpperCase() || ''}${word.slice(1).toLowerCase()}`;
    })
    .join(' ');

export const extractYearFromTitle = (value: string): number | null => {
  const currentYear = new Date().getFullYear() + 2;
  const matches = value.match(/\b(19\d{2}|20\d{2})\b/g) || [];
  for (const match of matches) {
    const year = Number.parseInt(match, 10);
    if (Number.isFinite(year) && year >= 1900 && year <= currentYear) {
      return year;
    }
  }
  return null;
};

export const normalizeTorrentTitle = (rawTitle: string): string => {
  const replaced = rawTitle.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
  const cutoff = replaced
    .replace(/\b(19\d{2}|20\d{2})\b.*$/g, '')
    .replace(/\b(2160p|1080p|720p|480p|x264|x265|h264|h265|webrip|web[- ]dl|bluray|brrip|hdrip|ddp|aac|dts|ac3|10bit|hevc|remastered|proper|repack)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return toTitleCase(cutoff || replaced);
};

export const parseTorrentListing = (
  html: string,
  sourceUrl: string,
  maxEntries: number
): ListingCandidate[] => {
  const $ = cheerio.load(html);
  const rows = $('table.table-list tbody tr');
  const results: ListingCandidate[] = [];
  const seenUrls = new Set<string>();

  rows.each((_, row) => {
    if (results.length >= maxEntries) return false;

    const links = $(row).find('td.name a');
    const titleAnchor = links.last();
    const rawTitle = titleAnchor.text().trim();
    const detailHref = titleAnchor.attr('href');
    if (!rawTitle || !detailHref) return;

    let detailUrl: string;
    try {
      detailUrl = new URL(detailHref, sourceUrl).toString();
    } catch {
      return;
    }

    if (seenUrls.has(detailUrl)) return;
    seenUrls.add(detailUrl);

    const year = extractYearFromTitle(rawTitle);
    if (!year) return;

    results.push({
      rawTitle,
      normalizedTitle: normalizeTorrentTitle(rawTitle),
      year,
      detailUrl,
      seeds: toNumber($(row).find('td.seeds').first().text()),
      leeches: toNumber($(row).find('td.leeches').first().text()),
    });
  });

  return results;
};

export const parseTorrentDetail = (html: string): { detailTitle?: string; magnetLink: string | null } => {
  const $ = cheerio.load(html);
  const detailTitle =
    $('.torrent-detail-info h3').first().text().trim() ||
    $('h1').first().text().trim() ||
    undefined;

  const magnetLink =
    $('a[href^="magnet:?xt=urn:btih:"]').first().attr('href') ||
    html.match(/magnet:\?xt=urn:btih:[^"'\s<]+/i)?.[0] ||
    null;

  return {
    detailTitle,
    magnetLink,
  };
};

export const extractInfoHash = (magnetLink: string): string | null => {
  const match = magnetLink.match(/btih:([a-fA-F0-9]+)/);
  return match?.[1]?.toUpperCase() || null;
};

const inferGenres = (title: string): Genre[] => {
  const text = title.toLowerCase();
  if (text.includes('nollywood')) return [Genre.Nollywood];
  if (text.includes('yoruba')) return [Genre.Yoruba, Genre.Nollywood];
  if (text.includes('igbo')) return [Genre.Igbo, Genre.Nollywood];
  if (text.includes('hausa')) return [Genre.Hausa, Genre.Nollywood];
  if (text.includes('bollywood') || text.includes('hindi')) return [Genre.Bollywood];
  return [Genre.Hollywood];
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export class TorrentDiscoveryService {
  private readonly config: Required<TorrentDiscoveryConfig>;
  private readonly logger: LoggerLike;
  private readonly flaresolverr = new FlareSolverrFetcher();
  private readonly queueService = new QueueService();
  private readonly metadataService: MetadataService;
  private readonly moviesService: MoviesService;
  private readonly circuitBreaker: CircuitBreaker;
  private isRunning = false;

  constructor(private readonly prisma: PrismaClient, logger: LoggerLike = console, config: TorrentDiscoveryConfig = {}) {
    this.logger = logger;
    this.config = {
      sourceUrl: (config.sourceUrl || DEFAULT_SOURCE_URL).trim(),
      maxItemsPerRun: Number.isFinite(config.maxItemsPerRun) && (config.maxItemsPerRun as number) > 0
        ? Math.min(config.maxItemsPerRun as number, 25)
        : 8,
      requireApproval: config.requireApproval ?? true,
      requestTimeoutMs:
        Number.isFinite(config.requestTimeoutMs) && (config.requestTimeoutMs as number) > 0
          ? Math.max(config.requestTimeoutMs as number, 10_000)
          : DEFAULT_TIMEOUT_MS,
      dryRun: config.dryRun ?? false,
      failureThreshold:
        Number.isFinite(config.failureThreshold) && (config.failureThreshold as number) > 0
          ? config.failureThreshold as number
          : 5,
      recoveryTimeoutMs:
        Number.isFinite(config.recoveryTimeoutMs) && (config.recoveryTimeoutMs as number) > 0
          ? config.recoveryTimeoutMs as number
          : 300_000,
    };
    this.metadataService = new MetadataService(prisma);
    this.moviesService = new MoviesService(prisma);
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: this.config.failureThreshold,
      recoveryTimeoutMs: this.config.recoveryTimeoutMs,
      halfOpenMaxCalls: 1,
    });
  }

  async discoverAndIngest(): Promise<TorrentDiscoveryRunSummary> {
    const baseSummary: TorrentDiscoveryRunSummary = {
      sourceUrl: this.config.sourceUrl,
      dryRun: this.config.dryRun,
      requireApproval: this.config.requireApproval,
      discovered: 0,
      resolved: 0,
      created: 0,
      queued: 0,
      awaitingApproval: 0,
      skippedExisting: 0,
      failed: 0,
      errors: [],
    };

    if (this.isRunning) {
      return {
        ...baseSummary,
        skippedRunReason: 'already-running',
      };
    }

    if (!this.circuitBreaker.canExecute()) {
      this.logger.warn('[TorrentDiscovery] Skipping run: circuit is open');
      return {
        ...baseSummary,
        skippedRunReason: 'circuit-open',
      };
    }

    this.isRunning = true;

    try {
      const listingHtml = await this.fetchHtml(this.config.sourceUrl);
      const listingWindow = Math.min(Math.max(this.config.maxItemsPerRun * 12, this.config.maxItemsPerRun), 300);
      const listingCandidates = parseTorrentListing(
        listingHtml,
        this.config.sourceUrl,
        listingWindow,
      );
      baseSummary.discovered = listingCandidates.length;

      const resolved: ResolvedTorrentCandidate[] = [];
      for (const candidate of listingCandidates) {
        // Resolve a larger pool than the per-run creation cap so we still get
        // fresh movies even when top candidates are already in the catalog.
        if (resolved.length >= this.config.maxItemsPerRun * 4) break;

        try {
          const detailHtml = await this.fetchHtml(candidate.detailUrl);
          const detail = parseTorrentDetail(detailHtml);
          if (!detail.magnetLink) {
            continue;
          }

          const titleFromDetail = normalizeTorrentTitle(detail.detailTitle || candidate.rawTitle);
          const yearFromDetail = extractYearFromTitle(detail.detailTitle || '') || candidate.year;

          resolved.push({
            ...candidate,
            detailTitle: detail.detailTitle,
            normalizedTitle: titleFromDetail,
            year: yearFromDetail,
            magnetLink: detail.magnetLink,
            infoHash: extractInfoHash(detail.magnetLink),
          });
        } catch (error) {
          baseSummary.failed += 1;
          baseSummary.errors.push(`detail:${candidate.detailUrl} -> ${toErrorMessage(error)}`);
        }
      }

      baseSummary.resolved = resolved.length;

      for (const candidate of resolved) {
        if (baseSummary.created >= this.config.maxItemsPerRun) {
          break;
        }

        const slug = toMovieSlug(candidate.normalizedTitle, candidate.year);

        try {
          const existingBySlug = await this.prisma.movie.findUnique({
            where: { slug },
            select: { id: true },
          });
          if (existingBySlug) {
            baseSummary.skippedExisting += 1;
            continue;
          }

          const existingByTitleYear = await this.prisma.movie.findFirst({
            where: {
              title: candidate.normalizedTitle,
              year: candidate.year,
            },
            select: { id: true },
          });
          if (existingByTitleYear) {
            baseSummary.skippedExisting += 1;
            continue;
          }

          if (this.config.dryRun) {
            baseSummary.created += 1;
            if (this.config.requireApproval) {
              baseSummary.awaitingApproval += 1;
            } else {
              baseSummary.queued += 1;
            }
            continue;
          }

          const movie = await this.moviesService.create({
            title: candidate.normalizedTitle,
            year: candidate.year,
            genre: inferGenres(candidate.normalizedTitle),
            quality: [Quality.Q720p],
            fileUrls: {},
            status: 'pending',
          });

          baseSummary.created += 1;

          await this.tryMetadataEnrichment(movie.id, candidate.normalizedTitle, candidate.year);

          if (this.config.requireApproval) {
            baseSummary.awaitingApproval += 1;
          } else {
            await this.queueService.addTorrentJob(candidate.magnetLink, movie.id);
            baseSummary.queued += 1;
          }
        } catch (error) {
          baseSummary.failed += 1;
          baseSummary.errors.push(`ingest:${candidate.detailUrl} -> ${toErrorMessage(error)}`);
        }
      }

      this.circuitBreaker.onSuccess();
      this.logger.info({ summary: baseSummary }, '[TorrentDiscovery] Run completed');
      return baseSummary;
    } catch (error) {
      this.circuitBreaker.onFailure();
      const message = toErrorMessage(error);
      this.logger.error({ error: message }, '[TorrentDiscovery] Run failed');
      baseSummary.failed += 1;
      baseSummary.errors.push(message);
      return baseSummary;
    } finally {
      this.isRunning = false;
    }
  }

  private async fetchHtml(url: string): Promise<string> {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
    };

    if (this.flaresolverr.canHandle()) {
      try {
        const response = await this.flaresolverr.get(url, {
          headers,
          timeoutMs: this.config.requestTimeoutMs,
          sourceId: 'torrent-discovery',
        });
        if (response.status >= 200 && response.status < 300 && response.body.trim().length > 0) {
          return response.body;
        }
        throw new Error(`FlareSolverr returned status ${response.status} for ${url}`);
      } catch (error) {
        this.logger.warn(
          `[TorrentDiscovery] FlareSolverr fetch failed, falling back to direct fetch for ${url}: ${toErrorMessage(error)}`
        );
      }
    }

    const response = await axios.get<string>(url, {
      headers,
      timeout: this.config.requestTimeoutMs,
      responseType: 'text',
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300 || typeof response.data !== 'string') {
      throw new Error(`Direct fetch failed for ${url} (status ${response.status})`);
    }

    return response.data;
  }

  private async tryMetadataEnrichment(movieId: string, title: string, year: number): Promise<void> {
    try {
      await this.metadataService.fetchAndSaveMetadata(movieId, title, year);
    } catch (error) {
      this.logger.warn(
        `[TorrentDiscovery] Metadata enrichment failed for "${title}" (${year}): ${toErrorMessage(error)}`
      );
    }
  }
}
