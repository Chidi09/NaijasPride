import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { YouTubeChannelService } from "../../modules/admin/services/youtube-channel.service";
import { YouTubeMusicService } from "../../modules/music/youtube-music.service";
import { YoutubeDiscoveryService } from "../../modules/admin/services/youtube-discovery.service";
import { TvTmdbSyncService } from "../../modules/tv-shows/tv-tmdb-sync.service";
import { MovieTmdbSyncService } from "../../modules/movies/movie-tmdb-sync.service";
import { YouTubeStatsSyncService } from "../../modules/music/youtube-stats-sync.service";
import { AutoLibraryDiscoveryService } from "../../modules/books/auto-library-discovery.service";
import { MangaService } from "../../modules/books/manga.service";
import { NewChapterService } from "../../modules/books/new-chapter.service";
import { WrappedCronService } from "../../modules/wrapped/wrapped.cron";
import {
  bookImportQueue,
  elsciMirrorQueue,
  annasMirrorQueue,
  bookCoverQueue,
} from "../services/queue.service";
import { StorageService } from "../services/storage.service";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

export interface SchedulerContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  log: FastifyInstance["log"];
}

// Type-safe environment parsers
export const parseBooleanFlag = (
  value: string | undefined,
  defaultValue: boolean,
): boolean => {
  if (typeof value !== "string") return defaultValue;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
};

export const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * YouTube channel monitoring scheduler
 */
export function setupYouTubeSchedulers(ctx: SchedulerContext): void {
  const { log, prisma } = ctx;
  const channelService = new YouTubeChannelService(prisma);
  const musicChannelService = new YouTubeMusicService(prisma);
  const discoveryService = new YoutubeDiscoveryService(prisma);

  const sixHoursMs = 6 * 60 * 60 * 1000;
  const twelveHoursMs = 12 * 60 * 60 * 1000;

  // Monitor every 6 hours
  setInterval(() => {
    channelService.monitorAllChannelsEvery6Hours().catch((error) => {
      log.error({ error }, "YouTube channel monitor failed");
    });
    musicChannelService.monitorAll().catch((error) => {
      log.error({ error }, "YouTube music channel monitor failed");
    });
  }, sixHoursMs);

  setInterval(() => {
    discoveryService.runDiscoveryCycle().catch((error) => {
      log.error({ error }, "YouTube auto-discovery cycle failed");
    });
  }, twelveHoursMs);

  // Initial runs
  channelService.monitorAllChannelsEvery6Hours().catch((error) => {
    log.error({ error }, "Initial YouTube channel monitor run failed");
  });
  musicChannelService.monitorAll().catch((error) => {
    log.error({ error }, "Initial YouTube music channel monitor run failed");
  });

  // Initial discovery after 1 hour to avoid quota hits at boot
  setTimeout(
    () => {
      discoveryService.runDiscoveryCycle().catch((error) => {
        log.error({ error }, "Initial YouTube auto-discovery cycle failed");
      });
    },
    60 * 60 * 1000,
  );

  log.info("YouTube schedulers initialized");
}

/**
 * TMDB sync schedulers for TV shows and movies
 */
export function setupTmdbSchedulers(ctx: SchedulerContext): void {
  const { log, prisma } = ctx;

  // TV TMDB Sync
  const tvTmdbSyncEnabled = parseBooleanFlag(
    process.env.TV_TMDB_SYNC_ENABLED,
    true,
  );
  if (tvTmdbSyncEnabled) {
    const tvSyncService = new TvTmdbSyncService(prisma);
    const tvSyncIntervalMs = parsePositiveInt(
      process.env.TV_TMDB_SYNC_INTERVAL_MS,
      6 * 60 * 60 * 1000,
    );
    const tvSyncStartupDelayMs = parsePositiveInt(
      process.env.TV_TMDB_SYNC_STARTUP_DELAY_MS,
      90 * 1000,
    );
    const tvSyncPagesPerList = parsePositiveInt(
      process.env.TV_TMDB_SYNC_PAGES_PER_LIST,
      5,
    );
    const tvSyncMaxShows = parsePositiveInt(
      process.env.TV_TMDB_SYNC_MAX_SHOWS_PER_RUN,
      300,
    );

    const runTvSync = () => {
      tvSyncService
        .syncCatalog({
          pagesPerList: tvSyncPagesPerList,
          maxShows: tvSyncMaxShows,
        })
        .then((summary) => log.info({ summary }, "[TvTmdbSync] Completed"))
        .catch((error) => log.error({ error }, "[TvTmdbSync] Failed"));
    };

    setInterval(runTvSync, tvSyncIntervalMs);
    setTimeout(runTvSync, tvSyncStartupDelayMs);
    log.info(
      {
        tvSyncIntervalMs,
        tvSyncStartupDelayMs,
        tvSyncPagesPerList,
        tvSyncMaxShows,
      },
      "[TvTmdbSync] Scheduler enabled",
    );
  }

  // Movie TMDB Sync
  const movieTmdbSyncEnabled = parseBooleanFlag(
    process.env.MOVIE_TMDB_SYNC_ENABLED,
    true,
  );
  if (movieTmdbSyncEnabled) {
    const movieSyncService = new MovieTmdbSyncService(prisma);
    const movieSyncIntervalMs = parsePositiveInt(
      process.env.MOVIE_TMDB_SYNC_INTERVAL_MS,
      12 * 60 * 60 * 1000,
    );
    const movieSyncStartupDelayMs = parsePositiveInt(
      process.env.MOVIE_TMDB_SYNC_STARTUP_DELAY_MS,
      2 * 60 * 1000,
    );
    const movieSyncPagesPerList = parsePositiveInt(
      process.env.MOVIE_TMDB_SYNC_PAGES_PER_LIST,
      5,
    );
    const movieSyncMaxMovies = parsePositiveInt(
      process.env.MOVIE_TMDB_SYNC_MAX_MOVIES_PER_RUN,
      500,
    );

    const runMovieSync = () => {
      movieSyncService
        .syncCatalog({
          pagesPerList: movieSyncPagesPerList,
          maxMovies: movieSyncMaxMovies,
        })
        .then((summary) => log.info({ summary }, "[MovieTmdbSync] Completed"))
        .catch((error) => log.error({ error }, "[MovieTmdbSync] Failed"));
    };

    setInterval(runMovieSync, movieSyncIntervalMs);
    setTimeout(runMovieSync, movieSyncStartupDelayMs);
    log.info(
      {
        movieSyncIntervalMs,
        movieSyncStartupDelayMs,
        movieSyncPagesPerList,
        movieSyncMaxMovies,
      },
      "[MovieTmdbSync] Scheduler enabled",
    );
  }
}

/**
 * Bootstrap schedulers for initial data population
 */
export function setupBootstrapSchedulers(ctx: SchedulerContext): void {
  const { log, prisma } = ctx;
  const channelService = new YouTubeChannelService(prisma);
  const musicChannelService = new YouTubeMusicService(prisma);

  // Movie channel bootstrap
  const movieChannelBootstrapEnabled = parseBooleanFlag(
    process.env.MOVIE_CHANNEL_BOOTSTRAP_ENABLED,
    true,
  );
  if (movieChannelBootstrapEnabled) {
    const fallbackUrls = [
      "https://www.youtube.com/@shemaroomoviein",
      "https://www.youtube.com/@UltraBollywood",
      "https://www.youtube.com/@GoldminesBollywood",
      "https://www.youtube.com/@MovieCentral",
    ];
    const configuredUrls = (process.env.MOVIE_CHANNEL_BOOTSTRAP_URLS || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const channelUrls =
      configuredUrls.length > 0 ? configuredUrls : fallbackUrls;

    setTimeout(() => {
      channelService
        .bootstrapChannels(channelUrls)
        .then((summary) => {
          log.info(
            { summary, attempted: channelUrls.length },
            "[MovieChannelBootstrap] Completed",
          );
          if (summary.created > 0) {
            channelService.monitorAllChannelsEvery6Hours().catch((error) => {
              log.error(
                { error },
                "[MovieChannelBootstrap] Monitor run after bootstrap failed",
              );
            });
          }
        })
        .catch((error) =>
          log.error({ error }, "[MovieChannelBootstrap] Failed"),
        );
    }, 25_000);
  }

  // YouTube stats sync (daily)
  const ytStatsSyncService = new YouTubeStatsSyncService(prisma, log);
  const oneDayMs = 24 * 60 * 60 * 1000;
  setInterval(() => {
    ytStatsSyncService.syncAll().catch((error) => {
      log.error({ error }, "[YTStatsSync] Daily sync failed");
    });
  }, oneDayMs);

  setTimeout(
    () => {
      ytStatsSyncService.syncAll().catch((error) => {
        log.error({ error }, "[YTStatsSync] Initial sync failed");
      });
    },
    30 * 60 * 1000,
  );

  // Music auto-bootstrap
  const musicAutoBootstrapEnabled =
    (process.env.MUSIC_AUTO_BOOTSTRAP_ENABLED || "true").toLowerCase() !==
    "false";
  if (musicAutoBootstrapEnabled) {
    setTimeout(() => {
      musicChannelService
        .bootstrapTopNigerianCatalog()
        .then((summary) => {
          if (summary.skipped) {
            log.info({ summary }, "[MusicBootstrap] Skipped");
          } else {
            log.info(
              { summary },
              "[MusicBootstrap] Started top-artist imports",
            );
          }
        })
        .catch((error) => log.error({ error }, "[MusicBootstrap] Failed"));
    }, 20_000);
  }
}

/**
 * Data migration schedulers (one-time runs)
 */
export function setupMigrationSchedulers(ctx: SchedulerContext): void {
  const { log, prisma } = ctx;

  // Elsci URL migration (15s after startup)
  setTimeout(async () => {
    try {
      const staleElsci = await prisma.book.findMany({
        where: {
          OR: [
            { publisher: { contains: "elsci", mode: "insensitive" } },
            { slug: { startsWith: "elsci-ln-" } },
          ],
          downloadUrl: { startsWith: "/api/v1/books/external/elsci/file" },
        },
        select: { id: true, slug: true, format: true },
      });

      if (staleElsci.length === 0) {
        log.info(
          "[ElsciUrlFix] All Elsci books already point to R2. Nothing to do.",
        );
        return;
      }

      log.info(
        `[ElsciUrlFix] Fixing ${staleElsci.length} Elsci books with stale downloadUrl...`,
      );
      let fixed = 0;
      for (const book of staleElsci) {
        const ext =
          (book.format || "epub").toLowerCase() === "pdf" ? "pdf" : "epub";
        const storageKey = `books/elsci/${book.slug}.${ext}`;
        const localUrl = `/api/v1/books/download?key=${encodeURIComponent(storageKey)}`;
        await prisma.book.update({
          where: { id: book.id },
          data: { downloadUrl: localUrl },
        });
        fixed++;
      }
      log.info(
        `[ElsciUrlFix] Updated ${fixed} Elsci book downloadUrls to R2 paths.`,
      );
    } catch (error) {
      log.error({ error }, "[ElsciUrlFix] Failed to fix Elsci downloadUrls");
    }
  }, 15_000);

  // Book cover URL backfill (25s after startup)
  setTimeout(async () => {
    try {
      const storagePublicBaseUrl = (
        process.env.STORAGE_PUBLIC_BASE_URL ||
        process.env.S3_PUBLIC_BASE_URL ||
        ""
      ).trim();
      const coverKeyBySlug = new Map<string, string>();
      let continuationToken: string | undefined;

      do {
        const page = await StorageService.getClient().send(
          new ListObjectsV2Command({
            Bucket: StorageService.getBucket(),
            Prefix: "covers/books/",
            ContinuationToken: continuationToken,
          }),
        );

        for (const entry of page.Contents || []) {
          const key = (entry.Key || "").trim();
          if (!key || !/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(key)) continue;
          const fileName = key.split("/").pop() || "";
          const slug = fileName.replace(/\.[^.]+$/i, "").trim();
          if (!slug || coverKeyBySlug.has(slug)) continue;
          coverKeyBySlug.set(slug, key);
        }

        continuationToken = page.IsTruncated
          ? page.NextContinuationToken
          : undefined;
      } while (continuationToken);

      if (coverKeyBySlug.size === 0) {
        log.info(
          "[BookCoverUrlFix] No R2 cover keys found under covers/books/.",
        );
        return;
      }

      const missingCovers = await prisma.book.findMany({
        where: {
          status: "active",
          OR: [{ coverUrl: null }, { coverUrl: "" }],
        },
        select: { id: true, slug: true },
      });

      let updated = 0;
      for (const book of missingCovers) {
        const key = coverKeyBySlug.get(book.slug);
        if (!key) continue;

        const coverUrl = storagePublicBaseUrl
          ? `${storagePublicBaseUrl.replace(/\/+$/, "")}/${key}`
          : `/api/v1/books/download?key=${encodeURIComponent(key)}`;

        await prisma.book.update({
          where: { id: book.id },
          data: { coverUrl },
        });
        updated++;
      }

      log.info(
        {
          r2CoverKeys: coverKeyBySlug.size,
          missingBefore: missingCovers.length,
          updated,
        },
        "[BookCoverUrlFix] Backfilled book cover URLs from existing R2 objects",
      );

      // Queue cover extraction for remaining missing covers
      const remainingMissing = await prisma.book.findMany({
        where: {
          status: "active",
          OR: [{ coverUrl: null }, { coverUrl: "" }],
          AND: [
            { downloadUrl: { not: null } },
            { NOT: { downloadUrl: { startsWith: "magnet:" } } },
          ],
        },
        select: { id: true },
        take: parsePositiveInt(
          process.env.BOOK_COVER_STARTUP_BACKFILL_LIMIT,
          200,
        ),
      });

      const queue = bookCoverQueue.get();
      if (!queue || remainingMissing.length === 0) return;

      let queued = 0;
      for (const book of remainingMissing) {
        try {
          await queue.add(
            "extract-book-cover",
            {
              bookId: book.id,
              reason: "startup-missing-cover-backfill",
              timestamp: Date.now(),
            },
            {
              jobId: `book-cover-${book.id}`,
              removeOnComplete: true,
              removeOnFail: false,
            },
          );
          queued++;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (/job.+exists/i.test(message)) {
            const existing = await queue.getJob(`book-cover-${book.id}`);
            if (existing) {
              const state = await existing.getState();
              if (state === "failed") {
                await existing.retry();
                queued++;
              }
            }
          }
        }
      }

      log.info(
        { queued },
        "[BookCoverUrlFix] Queued missing cover extraction jobs",
      );
    } catch (error) {
      log.error(
        { error },
        "[BookCoverUrlFix] Failed to backfill book cover URLs",
      );
    }
  }, 25_000);
}

/**
 * Book/Content import schedulers
 */
export function setupImportSchedulers(ctx: SchedulerContext): void {
  const { log } = ctx;

  // Auto-Library discovery scheduler
  const autoLibraryEnabled = parseBooleanFlag(
    process.env.BOOK_AUTO_LIBRARY_ENABLED,
    false,
  );
  if (autoLibraryEnabled) {
    const intervalMs = parsePositiveInt(
      process.env.BOOK_AUTO_LIBRARY_INTERVAL_MS,
      24 * 60 * 60 * 1000,
    );
    const startupDelayMs = parsePositiveInt(
      process.env.BOOK_AUTO_LIBRARY_STARTUP_DELAY_MS,
      3 * 60 * 1000,
    );
    const autoLibraryService = new AutoLibraryDiscoveryService(
      ctx.prisma,
      console,
    );

    const runAutoLibrary = () => {
      autoLibraryService
        .discoverAndSync({
          includeMustHaves: parseBooleanFlag(
            process.env.BOOK_AUTO_LIBRARY_INCLUDE_MUST_HAVES,
            true,
          ),
          includeTrending: parseBooleanFlag(
            process.env.BOOK_AUTO_LIBRARY_INCLUDE_TRENDING,
            true,
          ),
          maxTargets: parsePositiveInt(
            process.env.BOOK_AUTO_LIBRARY_MAX_TARGETS,
            24,
          ),
          maxMatches: parsePositiveInt(
            process.env.BOOK_AUTO_LIBRARY_MAX_MATCHES,
            8,
          ),
          minSeeders: parsePositiveInt(
            process.env.BOOK_AUTO_LIBRARY_MIN_SEEDERS,
            1,
          ),
          ingest: parseBooleanFlag(process.env.BOOK_AUTO_LIBRARY_INGEST, false),
          dryRun: parseBooleanFlag(process.env.BOOK_AUTO_LIBRARY_DRY_RUN, true),
        })
        .then((summary) =>
          log.info({ summary }, "[AutoLibrary] Scheduled run completed"),
        )
        .catch((error) =>
          log.error({ error }, "[AutoLibrary] Scheduled run failed"),
        );
    };

    setInterval(runAutoLibrary, intervalMs);
    setTimeout(runAutoLibrary, startupDelayMs);
    log.info({ intervalMs, startupDelayMs }, "[AutoLibrary] Scheduler enabled");
  }

  // Elsci auto-import scheduler
  const elsciAutoEnabled = parseBooleanFlag(
    process.env.ELSCI_AUTO_IMPORT_ENABLED,
    false,
  );
  if (elsciAutoEnabled) {
    const elsciIntervalMs = parsePositiveInt(
      process.env.ELSCI_AUTO_IMPORT_INTERVAL_MS,
      6 * 60 * 60 * 1000,
    );
    const elsciStartupDelayMs = parsePositiveInt(
      process.env.ELSCI_AUTO_IMPORT_STARTUP_DELAY_MS,
      5 * 60 * 1000,
    );

    const runElsciImport = () => {
      const q = bookImportQueue.get();
      if (!q) {
        log.warn(
          "[ElsciScheduler] bookImportQueue not available — Redis may not be configured",
        );
        return;
      }
      q.add(
        "elsci-lightnovels",
        { source: "elsci-lightnovels", mode: "manual" },
        {
          jobId: `elsci-auto-${Date.now()}`,
          removeOnComplete: 50,
          removeOnFail: 20,
        },
      )
        .then(() =>
          log.info("[ElsciScheduler] Enqueued elsci-lightnovels import job"),
        )
        .catch((err: unknown) =>
          log.error({ err }, "[ElsciScheduler] Failed to enqueue import job"),
        );
    };

    setInterval(runElsciImport, elsciIntervalMs);
    setTimeout(runElsciImport, elsciStartupDelayMs);
    log.info(
      { elsciIntervalMs, elsciStartupDelayMs },
      "[ElsciScheduler] Enabled",
    );
  }

  // Elsci mirror harvester scheduler
  const elsciMirrorEnabled = parseBooleanFlag(
    process.env.ELSCI_MIRROR_ENABLED,
    true,
  );
  if (elsciMirrorEnabled) {
    const mirrorIntervalMs = parsePositiveInt(
      process.env.ELSCI_MIRROR_INTERVAL_MS,
      4 * 60 * 60 * 1000,
    );
    const mirrorStartupDelayMs = parsePositiveInt(
      process.env.ELSCI_MIRROR_STARTUP_DELAY_MS,
      8 * 60 * 1000,
    );
    const mirrorBatchSize = parsePositiveInt(
      process.env.ELSCI_MIRROR_BATCH_SIZE,
      10,
    );

    const runElsciMirror = () => {
      const q = elsciMirrorQueue.get();
      if (!q) {
        log.warn(
          "[ElsciMirror] elsciMirrorQueue not available — Redis may not be configured",
        );
        return;
      }
      q.add(
        "mirror-batch",
        {
          batchSize: mirrorBatchSize,
          triggeredBy: "scheduler",
          timestamp: Date.now(),
        },
        {
          jobId: `elsci-mirror-${Date.now()}`,
          removeOnComplete: 20,
          removeOnFail: 10,
        },
      )
        .then(() => log.info("[ElsciMirror] Enqueued mirror job"))
        .catch((err: unknown) =>
          log.error({ err }, "[ElsciMirror] Failed to enqueue mirror job"),
        );
    };

    setInterval(runElsciMirror, mirrorIntervalMs);
    setTimeout(runElsciMirror, mirrorStartupDelayMs);
    log.info(
      { mirrorIntervalMs, mirrorStartupDelayMs, mirrorBatchSize },
      "[ElsciMirror] Scheduler enabled",
    );
  }

  // Anna's Archive mirror scheduler
  const annasMirrorEnabled = parseBooleanFlag(
    process.env.ANNAS_MIRROR_ENABLED,
    false,
  );
  if (annasMirrorEnabled) {
    const annasMirrorIntervalMs = parsePositiveInt(
      process.env.ANNAS_MIRROR_INTERVAL_MS,
      6 * 60 * 60 * 1000,
    );
    const annasMirrorStartupDelayMs = parsePositiveInt(
      process.env.ANNAS_MIRROR_STARTUP_DELAY_MS,
      10 * 60 * 1000,
    );
    const annasMirrorBatchSize = parsePositiveInt(
      process.env.ANNAS_MIRROR_BATCH_SIZE,
      5,
    );

    const runAnnasMirror = () => {
      const q = annasMirrorQueue.get();
      if (!q) {
        log.warn(
          "[AnnasMirror] annasMirrorQueue not available — Redis may not be configured",
        );
        return;
      }
      q.add(
        "mirror-annas-books",
        {
          batchSize: annasMirrorBatchSize,
          triggeredBy: "scheduler",
          timestamp: Date.now(),
        },
        {
          jobId: `annas-mirror-${Date.now()}`,
          removeOnComplete: 20,
          removeOnFail: 10,
        },
      )
        .then(() => log.info("[AnnasMirror] Enqueued mirror job"))
        .catch((err: unknown) =>
          log.error({ err }, "[AnnasMirror] Failed to enqueue mirror job"),
        );
    };

    setInterval(runAnnasMirror, annasMirrorIntervalMs);
    setTimeout(runAnnasMirror, annasMirrorStartupDelayMs);
    log.info(
      {
        annasMirrorIntervalMs,
        annasMirrorStartupDelayMs,
        annasMirrorBatchSize,
      },
      "[AnnasMirror] Scheduler enabled",
    );
  }
}

/**
 * Initialize all schedulers
 */
export function initializeSchedulers(ctx: SchedulerContext): void {
  setupYouTubeSchedulers(ctx);
  setupTmdbSchedulers(ctx);
  setupBootstrapSchedulers(ctx);
  setupMigrationSchedulers(ctx);
  setupImportSchedulers(ctx);

  ctx.log.info("All schedulers initialized");
}
