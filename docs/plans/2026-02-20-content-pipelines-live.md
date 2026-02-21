# Content Pipelines — Live Ingest Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make all four content pipelines (1337x books, 1337x torrent movies, Elsci light novels, Soap2Day crawler) automatically discover content, ingest it to the DB, and surface it to users — with TMDB covers on movies.

**Architecture:**
- Tracks 1 & 2 are env-var-only changes (schedulers already exist, ingest code already works).
- Track 3 adds a scheduler for the Elsci BullMQ import job in `app.ts`.
- Track 4 builds a new `Soap2DayCrawlerService` that scrapes listing pages with Playwright, resolves streams, fetches TMDB metadata, and saves active Movie records on a 12-hour schedule.

**Tech Stack:** TypeScript, Fastify, Prisma, BullMQ, Playwright (Chromium), Cheerio, Axios, TMDB API

---

## Track 1 — Book Auto-Library: Enable Live Ingest

No code changes. Only the VPS `.env` file needs updating.

### Task 1: Enable live book ingest on the server

**Files:**
- Modify: `/opt/naijaspride/.env` (on VPS — run via SSH)

**Step 1: Update env vars on VPS**

SSH into the server and edit `.env`:
```bash
cd /opt/naijaspride
# Set these values (use sed or nano):
sed -i 's/^BOOK_AUTO_LIBRARY_ENABLED=.*/BOOK_AUTO_LIBRARY_ENABLED=true/' .env
sed -i 's/^BOOK_AUTO_LIBRARY_INGEST=.*/BOOK_AUTO_LIBRARY_INGEST=true/' .env
sed -i 's/^BOOK_AUTO_LIBRARY_DRY_RUN=.*/BOOK_AUTO_LIBRARY_DRY_RUN=false/' .env
sed -i 's/^BOOK_AUTO_LIBRARY_MIN_SEEDERS=.*/BOOK_AUTO_LIBRARY_MIN_SEEDERS=1/' .env
```

**Step 2: Verify the values took effect**
```bash
grep "BOOK_AUTO_LIBRARY" .env
```
Expected output:
```
BOOK_AUTO_LIBRARY_ENABLED=true
BOOK_AUTO_LIBRARY_INGEST=true
BOOK_AUTO_LIBRARY_DRY_RUN=false
BOOK_AUTO_LIBRARY_MIN_SEEDERS=1
```

**Step 3: Test ingest manually before deploy**

Get token:
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@naijaspride.com","password":"n0LPUFF-oUyV6J9X"}' \
  | jq -r '.data.token')
```

Trigger discovery with ingest:
```bash
curl -s -X POST "http://localhost:3001/api/v1/admin/books/auto-library/discover" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false,"ingest":true,"maxTargets":5,"maxMatches":3,"minSeeders":0}' | jq '{matched:.data.matched,created:.data.created,errors:.data.errors}'
```
Expected: `created >= 1`, errors array either empty or only 403s.

**Step 4: Commit the .env.production.example update** (so the defaults are documented)

In the local repo:
```bash
# Already reflected in .env.production.example — verify:
grep "BOOK_AUTO_LIBRARY_INGEST\|BOOK_AUTO_LIBRARY_ENABLED\|BOOK_AUTO_LIBRARY_DRY_RUN" apps/api/.env.production.example
```

---

## Track 2 — Torrent Movie Discovery: Auto-activate + TMDB Covers

### Task 2: Verify TMDB key name and enable auto-discovery

**Files:**
- Modify: `/opt/naijaspride/.env` (on VPS)

**Step 1: Check which TMDB key env var the MetadataService reads**

It reads `TMDB_KEY` (not `TMDB_API_KEY`) — confirmed at `apps/api/src/modules/movies/metadata.service.ts:54`.

On VPS, verify it is set:
```bash
grep "TMDB" .env
```
Expected: `TMDB_KEY=<your-key>` must be present and non-empty. If it's blank or missing, copy the value from `TMDB_API_KEY` (used by the admin YouTube import service):
```bash
# Only run if TMDB_KEY is missing/empty:
TMDB_VAL=$(grep "^TMDB_API_KEY=" .env | cut -d= -f2-)
sed -i "s/^TMDB_KEY=.*/TMDB_KEY=$TMDB_VAL/" .env
```

**Step 2: Enable torrent discovery and auto-activate**
```bash
sed -i 's/^TORRENT_DISCOVERY_ENABLED=.*/TORRENT_DISCOVERY_ENABLED=true/' .env
sed -i 's/^TORRENT_DISCOVERY_REQUIRE_APPROVAL=.*/TORRENT_DISCOVERY_REQUIRE_APPROVAL=false/' .env
```

Verify:
```bash
grep "TORRENT_DISCOVERY_ENABLED\|TORRENT_DISCOVERY_REQUIRE_APPROVAL\|TMDB_KEY" .env
```
Expected:
```
TORRENT_DISCOVERY_ENABLED=true
TORRENT_DISCOVERY_REQUIRE_APPROVAL=false
TMDB_KEY=<non-empty value>
```

**Step 3: Deploy and verify**

After `./deploy.sh`, check logs:
```bash
# Should see scheduler startup message:
docker logs naijaspride-api-blue-1 --tail 50 | grep "TorrentDiscovery"
# Should see enrichment calls:
docker logs naijaspride-api-blue-1 -f --tail 0 | grep "TorrentDiscovery\|MetadataService"
```

Wait for the startup delay (default 2 min), then check DB:
```bash
# Count movies with posterUrl set (TMDB worked):
docker exec naijaspride-api-blue-1 \
  node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.movie.count({where:{posterUrl:{not:null}}}).then(n=>{console.log('Movies with poster:',n);p.\$disconnect()})"
```

---

## Track 3 — Elsci Light Novels: Auto-scheduler

### Task 3: Add Elsci import scheduler to app.ts

**Files:**
- Modify: `apps/api/src/app.ts`

**Step 1: Add scheduler block after the book auto-library block**

In `apps/api/src/app.ts`, find the end of the auto-library scheduler block (around line 357) and add immediately after:

```typescript
// Optional Elsci light novels auto-import scheduler
const elsciAutoEnabled = parseBooleanFlag(process.env.ELSCI_AUTO_IMPORT_ENABLED, false);
if (elsciAutoEnabled) {
  const elsciIntervalMs = parsePositiveInt(process.env.ELSCI_AUTO_IMPORT_INTERVAL_MS, 6 * 60 * 60 * 1000); // 6h
  const elsciStartupDelayMs = parsePositiveInt(process.env.ELSCI_AUTO_IMPORT_STARTUP_DELAY_MS, 5 * 60 * 1000); // 5min

  const runElsciImport = () => {
    const q = bookImportQueue.get();
    if (!q) {
      app.log.warn('[ElsciScheduler] bookImportQueue not available — Redis may not be configured');
      return;
    }
    q.add(
      'elsci-lightnovels',
      { source: 'elsci-lightnovels' },
      { jobId: `elsci-auto-${Date.now()}`, removeOnComplete: 50, removeOnFail: 20 },
    ).then(() => {
      app.log.info('[ElsciScheduler] Enqueued elsci-lightnovels import job');
    }).catch((err: unknown) => {
      app.log.error({ err }, '[ElsciScheduler] Failed to enqueue import job');
    });
  };

  setInterval(runElsciImport, elsciIntervalMs);
  setTimeout(runElsciImport, elsciStartupDelayMs);
  app.log.info({ elsciIntervalMs, elsciStartupDelayMs }, '[ElsciScheduler] Enabled');
}
```

**Step 2: Add env vars to .env.production.example**

In `apps/api/.env.production.example`, after the Elsci section (around line 166):
```
# ── Elsci Light Novels Auto-Import Scheduler ──────────────────────────────────
ELSCI_AUTO_IMPORT_ENABLED=false
ELSCI_AUTO_IMPORT_INTERVAL_MS=21600000
ELSCI_AUTO_IMPORT_STARTUP_DELAY_MS=300000
```

**Step 3: Commit**
```bash
git add apps/api/src/app.ts apps/api/.env.production.example
git commit -m "feat: add Elsci light novels auto-import scheduler

Enqueues a BullMQ job every 6 hours to import from Elsci index.
Controlled by ELSCI_AUTO_IMPORT_ENABLED env var (default: false)."
```

**Step 4: Enable on VPS**
```bash
# On VPS:
echo "ELSCI_AUTO_IMPORT_ENABLED=true" >> .env
echo "ELSCI_AUTO_IMPORT_INTERVAL_MS=21600000" >> .env
echo "ELSCI_AUTO_IMPORT_STARTUP_DELAY_MS=300000" >> .env
```

**Step 5: Verify after deploy**
```bash
docker logs naijaspride-api-blue-1 --tail 50 | grep "ElsciScheduler"
# Expected: "[ElsciScheduler] Enabled"
# After 5 min:
docker logs naijaspride-api-blue-1 --tail 50 | grep "ElsciScheduler\|elsci"
# Expected: "[ElsciScheduler] Enqueued elsci-lightnovels import job"
```

---

## Track 4 — Soap2Day Crawler

### Task 4: Build Soap2DayCrawlerService

**Files:**
- Create: `apps/api/src/modules/movies/soap2day-crawler.service.ts`

The crawler must:
1. Fetch a Soap2Day listing page URL (provided via env) using Playwright
2. Scrape `<article>` or `<div class="movie-item">` title/year/detail-URL elements
3. For each movie (up to batch cap): check if it already exists in DB by slug
4. For new movies: create pending Movie, call `RemoteStreamResolverService.resolveFromPage()` to get the HLS/MP4 stream
5. Update `fileUrls`, call `MetadataService.fetchAndSaveMetadata()` for TMDB poster
6. Set `status: 'active'` after both stream + metadata succeed

```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { Genre, Quality } from '@naijaspride/types';
import { RemoteStreamResolverService } from './remote-stream-resolver.service';
import { MetadataService } from './metadata.service';
import { MoviesService } from './movies.service';

type LoggerLike = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

export type Soap2DayCrawlerConfig = {
  listingUrls?: string[];   // from SOAP2DAY_CRAWLER_URLS
  maxPerRun?: number;        // from SOAP2DAY_CRAWLER_MAX_PER_RUN (default 5)
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
  errors: string[];
};

const toMovieSlug = (title: string, year: number) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${year}`;

const toErrorMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

type ListingItem = { title: string; year: number; detailUrl: string };

// Soap2Day listing pages typically have movie cards like:
//   <div class="movie-poster"> <a href="/movie/..." title="Movie Name (2024)">
// This parser is intentionally lenient — it accepts any <a> with href containing
// "/movie/" and extracts year from the title or href.
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

    // Try title attribute, then text content
    const rawTitle = ($(el).attr('title') || $(el).text()).trim();
    if (!rawTitle) return;

    // Extract year from title string "(2024)" or href "/movie-name-2024/"
    const yearMatch = rawTitle.match(/\b(19\d{2}|20\d{2})\b/) || detailUrl.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

    // Clean year from title
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
      skippedExisting: 0, failed: 0, errors: [],
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

          // Create a pending movie record first
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

          // Resolve stream
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
            // Don't abort — still try TMDB and activate
          }

          // TMDB enrichment (covers, rating, cast)
          try {
            await this.metadataService.fetchAndSaveMetadata(movie.id, item.title, item.year);
            summary.enriched += 1;
          } catch (err) {
            this.logger.warn(`[Soap2DayCrawler] TMDB enrichment failed for "${item.title}": ${toErrorMsg(err)}`);
          }

          // Activate the movie (with whatever we got)
          await this.prisma.movie.update({
            where: { id: movie.id },
            data: {
              status: 'active',
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
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
      await page.waitForTimeout(2000); // let JS render
      return await page.content();
    } finally {
      await browser.close();
    }
  }
}
```

**Step 5: Commit the new file**
```bash
git add apps/api/src/modules/movies/soap2day-crawler.service.ts
git commit -m "feat: add Soap2DayCrawlerService for scheduled Soap2Day movie discovery

Scrapes configured listing URLs with Playwright, resolves streams via
RemoteStreamResolverService, fetches TMDB metadata, and activates movies.
Batch size capped at 10 per run via SOAP2DAY_CRAWLER_MAX_PER_RUN."
```

### Task 5: Add admin endpoint + scheduler for Soap2Day crawler

**Files:**
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/.env.production.example`

**Step 1: Add admin endpoint in admin.routes.ts**

At the bottom of the `adminRoutes` function (before the `await app.register(adminQueueRoutes...)` lines), add:

```typescript
// POST /api/admin/movies/soap2day/crawl - Manually trigger Soap2Day crawler
app.post('/movies/soap2day/crawl', {
  preHandler: [app.authenticate, requireAdmin],
  schema: {
    body: z.object({
      maxPerRun: z.number().int().min(1).max(10).optional().default(5),
    }),
  },
  handler: async (request, reply) => {
    try {
      const { maxPerRun } = request.body as { maxPerRun: number };
      const { Soap2DayCrawlerService } = await import('../movies/soap2day-crawler.service');
      const crawler = new Soap2DayCrawlerService(app.prisma, console, { maxPerRun });
      const summary = await crawler.crawl();
      return reply.send({ status: 'success', data: summary });
    } catch (error) {
      return reply.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Soap2Day crawl failed',
      });
    }
  },
});
```

**Step 2: Add scheduler in app.ts**

After the torrent discovery scheduler block (around line 413), add:

```typescript
// Optional Soap2Day crawler scheduler
const soap2dayCrawlerEnabled = parseBooleanFlag(process.env.SOAP2DAY_CRAWLER_ENABLED, false);
if (soap2dayCrawlerEnabled) {
  const soap2dayIntervalMs = parsePositiveInt(process.env.SOAP2DAY_CRAWLER_INTERVAL_MS, 12 * 60 * 60 * 1000); // 12h
  const soap2dayStartupDelayMs = parsePositiveInt(process.env.SOAP2DAY_CRAWLER_STARTUP_DELAY_MS, 10 * 60 * 1000); // 10min

  const { Soap2DayCrawlerService } = await import('./modules/movies/soap2day-crawler.service');
  const soap2dayCrawler = new Soap2DayCrawlerService(app.prisma, console, {
    maxPerRun: parsePositiveInt(process.env.SOAP2DAY_CRAWLER_MAX_PER_RUN, 5),
  });

  const runSoap2DayCrawl = () => {
    soap2dayCrawler.crawl()
      .then(summary => app.log.info({ summary }, '[Soap2DayCrawler] Scheduled run complete'))
      .catch(err => app.log.error({ err }, '[Soap2DayCrawler] Scheduled run failed'));
  };

  setInterval(runSoap2DayCrawl, soap2dayIntervalMs);
  setTimeout(runSoap2DayCrawl, soap2dayStartupDelayMs);
  app.log.info({ soap2dayIntervalMs, soap2dayStartupDelayMs }, '[Soap2DayCrawler] Scheduler enabled');
}
```

Note: `start()` in app.ts is already `async`, so `await import(...)` is fine.

**Step 3: Add env vars to .env.production.example**
```
# ── Soap2Day Crawler ────────────────────────────────────────────────────────
SOAP2DAY_CRAWLER_ENABLED=false
SOAP2DAY_CRAWLER_URLS=https://soap2day.ac/genre/action/,https://soap2day.ac/genre/drama/
SOAP2DAY_CRAWLER_MAX_PER_RUN=5
SOAP2DAY_CRAWLER_INTERVAL_MS=43200000
SOAP2DAY_CRAWLER_STARTUP_DELAY_MS=600000
```

**Step 4: Commit**
```bash
git add apps/api/src/modules/admin/admin.routes.ts apps/api/src/app.ts apps/api/.env.production.example
git commit -m "feat: add Soap2Day crawler admin endpoint and scheduler

POST /api/v1/admin/movies/soap2day/crawl for manual trigger.
Automatic 12-hour schedule when SOAP2DAY_CRAWLER_ENABLED=true."
```

---

## Track 5 — Verification Script

### Task 6: Create verification script

**Files:**
- Create: `scripts/verify-content-pipelines.sh`

```bash
#!/usr/bin/env bash
# =============================================================================
# Verify all content pipelines are working
# Run on VPS: bash scripts/verify-content-pipelines.sh
# =============================================================================
set -euo pipefail

PORT=${1:-3001}
BASE="http://localhost:$PORT/api/v1"

echo "=== Content Pipeline Verification (port $PORT) ==="

# Get admin token
TOKEN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@naijaspride.com","password":"n0LPUFF-oUyV6J9X"}' \
  | jq -r '.data.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "FAIL: Could not get admin token"
  exit 1
fi
echo "OK: Auth token obtained"

# ── 1. Book auto-library ─────────────────────────────────────────────────────
echo ""
echo "--- 1. Book Auto-Library (1337x) ---"
RESULT=$(curl -s -X POST "$BASE/admin/books/auto-library/discover" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false,"ingest":true,"maxTargets":3,"maxMatches":2,"minSeeders":0}')
MATCHED=$(echo "$RESULT" | jq '.data.matched // 0')
CREATED=$(echo "$RESULT" | jq '.data.created // 0')
echo "  Matched: $MATCHED | Created: $CREATED"
if [ "$MATCHED" -gt 0 ]; then
  echo "  OK: 1337x book discovery working"
else
  echo "  WARN: No books matched — check 1337x connectivity and FlareSolverr"
  echo "  Errors: $(echo "$RESULT" | jq '.data.errors')"
fi

# ── 2. Torrent movie discovery ───────────────────────────────────────────────
echo ""
echo "--- 2. Torrent Movie Discovery (1337x) ---"
MOVIES_WITH_POSTER=$(curl -s "$BASE/movies?limit=1" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data | map(select(.posterUrl != null)) | length // 0')
echo "  Movies with TMDB poster in first page: $MOVIES_WITH_POSTER"
if [ "$MOVIES_WITH_POSTER" -gt 0 ]; then
  echo "  OK: TMDB enrichment working for discovered movies"
else
  echo "  WARN: No movies with posterUrl found — check TMDB_KEY and torrent discovery logs"
fi

# ── 3. Elsci light novels ────────────────────────────────────────────────────
echo ""
echo "--- 3. Elsci Light Novels ---"
ELSCI_COUNT=$(curl -s "$BASE/books?publisher=Elsci&limit=1" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.meta.total // 0')
echo "  Elsci books in DB: $ELSCI_COUNT"
if [ "$ELSCI_COUNT" -gt 0 ]; then
  echo "  OK: Elsci import has run at least once"
else
  echo "  WARN: No Elsci books — check ELSCI_AUTO_IMPORT_ENABLED and book-worker logs"
fi

# ── 4. External service health ───────────────────────────────────────────────
echo ""
echo "--- 4. External Service Health ---"
HEALTH=$(curl -s "$BASE/admin/health/external-services" \
  -H "Authorization: Bearer $TOKEN")
ELSCI_OK=$(echo "$HEALTH" | jq '.services.elsci.healthy // false')
FLARE_OK=$(echo "$HEALTH" | jq '.services.flaresolverr.healthy // false')
echo "  Elsci healthy: $ELSCI_OK"
echo "  FlareSolverr healthy: $FLARE_OK"

# ── 5. Soap2Day manual trigger ───────────────────────────────────────────────
echo ""
echo "--- 5. Soap2Day Crawler (manual trigger, 1 movie max) ---"
SOAP=$(curl -s -X POST "$BASE/admin/movies/soap2day/crawl" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxPerRun":1}')
SOAP_DISCOVERED=$(echo "$SOAP" | jq '.data.discovered // 0')
SOAP_CREATED=$(echo "$SOAP" | jq '.data.created // 0')
echo "  Discovered: $SOAP_DISCOVERED | Created: $SOAP_CREATED"
if [ "$SOAP_DISCOVERED" -gt 0 ]; then
  echo "  OK: Soap2Day crawler reached listing page"
else
  echo "  WARN: Soap2Day crawler found nothing — check SOAP2DAY_CRAWLER_URLS"
fi

echo ""
echo "=== Verification complete ==="
```

**Step 1: Save and make executable**
```bash
chmod +x scripts/verify-content-pipelines.sh
git add scripts/verify-content-pipelines.sh
git commit -m "test: add content pipeline verification script"
```

**Step 2: Run on VPS after full deploy**
```bash
bash scripts/verify-content-pipelines.sh 3001  # or 3002 depending on active stack
```

---

## Deployment Order

1. Implement Tracks 3, 4, 5 (code changes) → commit → push → merge to main
2. On VPS: update `.env` for Tracks 1 & 2 (env-only)
3. `./deploy.sh`
4. `bash scripts/verify-content-pipelines.sh <active-port>`
5. Set `SOAP2DAY_CRAWLER_URLS` and `SOAP2DAY_CRAWLER_ENABLED=true` in VPS `.env`
6. `./deploy.sh` again to pick up new env vars

## Key Env Vars to Set on VPS

| Var | Value |
|---|---|
| `BOOK_AUTO_LIBRARY_ENABLED` | `true` |
| `BOOK_AUTO_LIBRARY_INGEST` | `true` |
| `BOOK_AUTO_LIBRARY_DRY_RUN` | `false` |
| `BOOK_AUTO_LIBRARY_MIN_SEEDERS` | `1` |
| `TORRENT_DISCOVERY_ENABLED` | `true` |
| `TORRENT_DISCOVERY_REQUIRE_APPROVAL` | `false` |
| `TMDB_KEY` | `<your tmdb key>` |
| `ELSCI_AUTO_IMPORT_ENABLED` | `true` |
| `SOAP2DAY_CRAWLER_ENABLED` | `true` |
| `SOAP2DAY_CRAWLER_URLS` | comma-separated listing page URLs |
| `SOAP2DAY_CRAWLER_MAX_PER_RUN` | `5` |
