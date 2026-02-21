import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { Genre, Quality } from '@naijaspride/types';
import { RemoteStreamResolverService } from './remote-stream-resolver.service';
import { MetadataService } from './metadata.service';
import { MoviesService } from './movies.service';

type LoggerLike = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

export type Soap2DayCrawlerConfig = {
  listingUrls?: string[];
  maxPerRun?: number;
  timeoutMs?: number;
};

export type Soap2DayCrawlerSummary = {
  urls: string[];
  discovered: number;
  created: number;
  resolved: number;
  enriched: number;
  skippedExisting: number;
  failed: number;
  trackedTotal: number;
  trackedActive: number;
  errors: string[];
};

const toMovieSlug = (title: string, year: number) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${year}`;

const toErrorMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

type ListingItem = { title: string; year: number; detailUrl: string };

export const parseSoap2DayListing = (html: string, baseUrl: string): ListingItem[] => {
  const $ = cheerio.load(html);
  const items: ListingItem[] = [];
  const seen = new Set<string>();

  $('a[href*="/movie/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    let detailUrl: string;
    try {
      detailUrl = new URL(href, baseUrl).toString();
    } catch {
      return;
    }

    if (seen.has(detailUrl)) return;
    seen.add(detailUrl);

    const rawTitle = ($(el).attr('title') || $(el).text()).trim();
    if (!rawTitle) return;

    const yearMatch = rawTitle.match(/\b(19\d{2}|20\d{2})\b/) || detailUrl.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
    const title = rawTitle.replace(/\s*\(?(?:19|20)\d{2}\)?\s*/g, '').trim();
    if (!title) return;

    items.push({ title, year, detailUrl });
  });

  return items;
};

export class Soap2DayCrawlerService {
  private readonly listingUrls: string[];
  private readonly maxPerRun: number;
  private readonly timeoutMs: number;
  private readonly resolver: RemoteStreamResolverService;
  private readonly metadataService: MetadataService;
  private readonly moviesService: MoviesService;
  private isRunning = false;

  private soap2daySourceWhere() {
    return {
      OR: [
        { uploadedBy: 'soap2day-crawler' },
        { metadata: { path: ['source'], equals: 'soap2day-crawler' } },
      ],
    };
  }

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: LoggerLike = console,
    config: Soap2DayCrawlerConfig = {},
  ) {
    this.listingUrls = config.listingUrls?.filter(Boolean) ??
      (process.env.SOAP2DAY_CRAWLER_URLS || '')
        .split(',')
        .map(u => u.trim())
        .filter(Boolean);
    this.maxPerRun = Math.min(
      Number.isFinite(config.maxPerRun) && (config.maxPerRun as number) > 0
        ? config.maxPerRun as number
        : parseInt(process.env.SOAP2DAY_CRAWLER_MAX_PER_RUN || '5', 10) || 5,
      10,
    );
    this.timeoutMs = config.timeoutMs ?? 90_000;
    this.resolver = new RemoteStreamResolverService();
    this.metadataService = new MetadataService(prisma);
    this.moviesService = new MoviesService(prisma);
  }

  async crawl(): Promise<Soap2DayCrawlerSummary> {
    const summary: Soap2DayCrawlerSummary = {
      urls: this.listingUrls,
      discovered: 0, created: 0, resolved: 0, enriched: 0,
      skippedExisting: 0, failed: 0,
      trackedTotal: 0,
      trackedActive: 0,
      errors: [],
    };

    if (this.isRunning) {
      this.logger.warn('[Soap2DayCrawler] Already running — skipping');
      return summary;
    }
    if (!this.listingUrls.length) {
      this.logger.warn('[Soap2DayCrawler] No listing URLs configured (SOAP2DAY_CRAWLER_URLS is empty)');
      return summary;
    }

    this.isRunning = true;
    try {
      const allItems: ListingItem[] = [];

      for (const listingUrl of this.listingUrls) {
        try {
          const html = await this.fetchHtmlWithPlaywright(listingUrl);
          const items = parseSoap2DayListing(html, listingUrl);
          this.logger.info(`[Soap2DayCrawler] ${listingUrl} → ${items.length} items`);
          allItems.push(...items);
        } catch (err) {
          summary.failed += 1;
          summary.errors.push(`listing:${listingUrl} → ${toErrorMsg(err)}`);
          this.logger.error(`[Soap2DayCrawler] Failed to fetch listing ${listingUrl}: ${toErrorMsg(err)}`);
        }
      }

      summary.discovered = allItems.length;
      let processed = 0;

      for (const item of allItems) {
        if (processed >= this.maxPerRun) break;

        const slug = toMovieSlug(item.title, item.year);
        try {
          const existing = await this.prisma.movie.findFirst({
            where: { OR: [{ slug }, { title: item.title, year: item.year }] },
            select: { id: true },
          });
          if (existing) {
            summary.skippedExisting += 1;
            continue;
          }

          const movie = await this.moviesService.create({
            title: item.title,
            year: item.year,
            genre: [Genre.Hollywood],
            quality: [Quality.Q720p],
            fileUrls: {},
            status: 'pending',
          });
          summary.created += 1;
          processed += 1;

          let fileUrls: Record<string, string> = {};
          try {
            const resolved = await this.resolver.resolveFromPage(item.detailUrl, {
              provider: 'soap2day',
              timeoutMs: this.timeoutMs,
            });
            if (resolved.kind === 'hls') {
              fileUrls.hls = resolved.streamUrl;
            } else {
              fileUrls['720p'] = resolved.streamUrl;
            }
            summary.resolved += 1;
            this.logger.info(`[Soap2DayCrawler] Resolved stream for "${item.title}": ${resolved.streamUrl}`);
          } catch (err) {
            this.logger.warn(`[Soap2DayCrawler] Stream resolve failed for "${item.title}": ${toErrorMsg(err)}`);
          }

          try {
            await this.metadataService.fetchAndSaveMetadata(movie.id, item.title, item.year);
            summary.enriched += 1;
          } catch (err) {
            this.logger.warn(`[Soap2DayCrawler] TMDB enrichment failed for "${item.title}": ${toErrorMsg(err)}`);
          }

          await this.prisma.movie.update({
            where: { id: movie.id },
            data: {
              status: 'active',
              uploadedBy: 'soap2day-crawler',
              metadata: {
                source: 'soap2day-crawler',
                provider: 'soap2day',
                listingDetailUrl: item.detailUrl,
                crawlerUpdatedAt: new Date().toISOString(),
              },
              ...(Object.keys(fileUrls).length > 0 ? { fileUrls } : {}),
            },
          });

          this.logger.info(`[Soap2DayCrawler] Ingested "${item.title}" (${item.year})`);
        } catch (err) {
          summary.failed += 1;
          summary.errors.push(`${item.title} (${item.year}): ${toErrorMsg(err)}`);
          this.logger.error(`[Soap2DayCrawler] Failed to ingest "${item.title}": ${toErrorMsg(err)}`);
        }
      }

      const [trackedTotal, trackedActive] = await Promise.all([
        this.prisma.movie.count({ where: this.soap2daySourceWhere() }),
        this.prisma.movie.count({
          where: {
            ...this.soap2daySourceWhere(),
            status: 'active',
          },
        }),
      ]);

      summary.trackedTotal = trackedTotal;
      summary.trackedActive = trackedActive;
    } finally {
      this.isRunning = false;
    }

    this.logger.info({ summary }, '[Soap2DayCrawler] Run complete');
    return summary;
  }

  private async fetchHtmlWithPlaywright(url: string): Promise<string> {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    try {
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
      });
      // Use 'load' (not 'domcontentloaded') so redirects fully settle before
      // calling page.content(). 'domcontentloaded' fires mid-redirect on sites
      // like soap2day.ac that issue a 302 before landing on the real page.
      await page.goto(url, { waitUntil: 'load', timeout: this.timeoutMs });
      // Extra wait for any JS-driven navigation / lazy rendering
      await page.waitForTimeout(3000);
      return await page.content();
    } finally {
      await browser.close();
    }
  }
}
