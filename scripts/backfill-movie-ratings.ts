#!/usr/bin/env ts-node
/**
 * backfill-movie-ratings.ts
 *
 * Populates tmdbRating/imdbRating (and, incidentally, overview/tagline/cast/
 * trailer) for movies that have never been checked against TMDB/OMDB, via
 * MetadataService.fetchAndSaveMetadata — the same enrichment the live
 * "refresh metadata" admin action uses.
 *
 * The catalogue is large (100k+ rows, mostly YouTube-scraped uploads with no
 * TMDB match), so this is designed to run repeatedly rather than in one pass:
 *   - Rows are picked ordered by viewCount desc, so popular titles get
 *     ratings first.
 *   - Every attempt — match or miss — stamps `metadataCheckedAt`, so a row
 *     that will never match TMDB is tried once and skipped on future runs.
 *   - OMDB's free tier is a hard 1,000 requests/day; --omdb-budget caps how
 *     many of *this run's* movies are allowed to touch OMDB (falls back to
 *     TMDB-only once exhausted, matching fetchAndSaveMetadata's own
 *     graceful-degradation behavior) rather than aborting the run.
 *   - A 429 from TMDB backs off with increasing delay and gives up after a
 *     few consecutive failures rather than hammering a rate limit.
 *
 * Usage:
 *   npx ts-node scripts/backfill-movie-ratings.ts [--dry-run] [--limit 3000]
 *     [--delay-ms 250] [--omdb-budget 900]
 */

import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { MetadataService } from "../apps/api/src/modules/movies/metadata.service";

const DRY_RUN = process.argv.includes("--dry-run");

const argValue = (flag: string, fallback: number): number => {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  const parsed = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const LIMIT = argValue("--limit", 3000);
const DELAY_MS = argValue("--delay-ms", 250);
const OMDB_BUDGET = argValue("--omdb-budget", 900);
const MAX_CONSECUTIVE_429 = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isRateLimited = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 429;

async function main() {
  const tmdbKey = process.env.TMDB_KEY || process.env.TMDB_API_KEY;
  if (!tmdbKey) {
    console.error(
      "TMDB_KEY (or TMDB_API_KEY) is missing. Set it in your API environment before running this script.",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const metadataService = new MetadataService(prisma);

  const movies = await prisma.movie.findMany({
    where: {
      status: "active",
      tmdbRating: null,
      metadataCheckedAt: null,
    },
    select: { id: true, title: true, year: true },
    orderBy: { viewCount: "desc" },
    take: LIMIT,
  });

  console.log(
    `Found ${movies.length} unrated, unchecked movies (dry-run: ${DRY_RUN}, omdb-budget: ${OMDB_BUDGET})\n`,
  );

  let matched = 0;
  let notFound = 0;
  let errors = 0;
  let omdbUsed = 0;
  let consecutive429 = 0;

  for (const movie of movies) {
    const allowOmdb = omdbUsed < OMDB_BUDGET;
    if (allowOmdb) omdbUsed++;

    let result: Awaited<
      ReturnType<typeof metadataService.fetchAndSaveMetadata>
    > | null = null;
    let attemptError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await metadataService.fetchAndSaveMetadata(
          movie.id,
          movie.title,
          movie.year,
          { dryRun: DRY_RUN, allowOmdb },
        );
        attemptError = null;
        break;
      } catch (error) {
        attemptError = error;
        if (isRateLimited(error)) {
          const backoffMs = 5000 * Math.pow(2, attempt);
          console.warn(
            `  [429] rate limited on "${movie.title}" — backing off ${backoffMs}ms`,
          );
          await sleep(backoffMs);
          continue;
        }
        break; // non-429 error: don't retry this movie
      }
    }

    if (result) {
      consecutive429 = 0;
      if (result.success) {
        matched++;
        console.log(
          `[OK]  "${movie.title}" → tmdbRating=${result.tmdbRating ?? "—"} imdbRating=${result.imdbRating ?? "—"}`,
        );
      } else {
        notFound++;
        console.log(`[--]  "${movie.title}" — no TMDB match`);
      }
      if (!DRY_RUN) {
        await prisma.movie.update({
          where: { id: movie.id },
          data: { metadataCheckedAt: new Date() },
        });
      }
    } else {
      errors++;
      if (isRateLimited(attemptError)) {
        consecutive429++;
        console.error(
          `  [ERR] "${movie.title}" — still rate limited after retries`,
        );
        if (consecutive429 >= MAX_CONSECUTIVE_429) {
          console.error(
            `\nAborting: ${MAX_CONSECUTIVE_429} consecutive rate-limit failures. Try again later.`,
          );
          break;
        }
      } else {
        consecutive429 = 0;
        console.error(
          `  [ERR] "${movie.title}" — ${attemptError instanceof Error ? attemptError.message : String(attemptError)}`,
        );
      }
      // Deliberately not stamping metadataCheckedAt on errors — this wasn't
      // a real miss, so it should be retried on the next run.
    }

    await sleep(DELAY_MS);
  }

  const remaining = await prisma.movie.count({
    where: { status: "active", tmdbRating: null, metadataCheckedAt: null },
  });

  console.log(`\n=== Summary ===`);
  console.log(`  Matched      : ${matched}`);
  console.log(`  No TMDB match: ${notFound}`);
  console.log(`  Errors       : ${errors}`);
  console.log(`  OMDB used    : ${omdbUsed} / ${OMDB_BUDGET}`);
  console.log(`  Remaining    : ${remaining}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
