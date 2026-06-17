#!/usr/bin/env ts-node
/**
 * backfill-book-authors.ts
 *
 * Enriches books that have no real author (Unknown / empty) by querying:
 *   1. Google Books API  (primary — returns structured author list)
 *   2. Open Library API  (fallback)
 *
 * For light novels the title typically includes a volume suffix like
 * "Grimgar of Fantasy and Ash - Volume 21". We strip that when searching
 * so the series-level record is found rather than a specific volume.
 *
 * Usage:
 *   npx ts-node scripts/backfill-book-authors.ts [--dry-run] [--limit 50]
 */

import axios from "axios";
import { PrismaClient } from "@prisma/client";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 500;
})();

const GOOGLE_BOOKS_BASE = "https://www.googleapis.com/books/v1/volumes";
const OPEN_LIBRARY_BASE = "https://openlibrary.org/search.json";
const DELAY_MS = 600; // stay under Google's 100 req/min free tier

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Strip " - Volume N", " Vol. N", " v0N" suffixes so we search the series title
const seriesTitle = (title: string): string =>
  title
    .replace(/\s*[-–]\s*volume\s+\d+\s*$/i, "")
    .replace(/\s*vol\.?\s*\d+\s*$/i, "")
    .replace(/\s*v\d+\s*$/i, "")
    .replace(/\s*[-–]\s*complete\s*$/i, "")
    .trim();

const isUnknown = (author: string | null) =>
  !author ||
  ["unknown", "various", "n/a", ""].includes(author.toLowerCase().trim());

// ── Google Books ──────────────────────────────────────────────────────────────

async function fetchGoogleBooksAuthor(
  title: string,
  year?: number | null,
): Promise<string | null> {
  try {
    const q = `intitle:${encodeURIComponent(seriesTitle(title))}`;
    const { data } = await axios.get<{
      items?: Array<{
        volumeInfo: {
          title: string;
          authors?: string[];
          publishedDate?: string;
        };
      }>;
    }>(`${GOOGLE_BOOKS_BASE}?q=${q}&maxResults=5`, { timeout: 10_000 });

    if (!data.items?.length) return null;

    const searchNorm = seriesTitle(title).toLowerCase();
    let best: { authors?: string[] } | null = null;
    let bestScore = -1;

    for (const item of data.items) {
      const info = item.volumeInfo;
      let score = 0;
      const norm = (info.title || "").toLowerCase();
      if (norm === searchNorm) score += 100;
      else if (norm.includes(searchNorm) || searchNorm.includes(norm))
        score += 50;
      if (info.authors?.length) score += 20;
      if (year && info.publishedDate) {
        const y = parseInt(info.publishedDate, 10);
        if (!isNaN(y) && Math.abs(y - year) <= 2) score += 10;
      }
      if (score > bestScore) {
        bestScore = score;
        best = info;
      }
    }

    return best?.authors?.[0] || null;
  } catch {
    return null;
  }
}

// ── Open Library ─────────────────────────────────────────────────────────────

async function fetchOpenLibraryAuthor(title: string): Promise<string | null> {
  try {
    const { data } = await axios.get<{
      docs?: Array<{ author_name?: string[] }>;
    }>(OPEN_LIBRARY_BASE, {
      params: {
        title: seriesTitle(title),
        limit: 3,
        fields: "author_name,title",
      },
      timeout: 10_000,
    });
    return data.docs?.[0]?.author_name?.[0] || null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient();

  const books = await prisma.book.findMany({
    where: {
      OR: [
        { author: { in: ["Unknown", "unknown", "Various", "N/A", ""] } },
        { author: null as any },
      ],
      status: "active",
    },
    select: { id: true, title: true, author: true, year: true, slug: true },
    orderBy: { updatedAt: "asc" },
    take: LIMIT,
  });

  console.log(
    `Found ${books.length} books with unknown/empty author (dry-run: ${DRY_RUN})\n`,
  );

  let updated = 0,
    notFound = 0,
    errors = 0;

  for (const book of books) {
    let author: string | null = null;

    // 1. Google Books
    author = await fetchGoogleBooksAuthor(book.title, book.year);
    await sleep(DELAY_MS);

    // 2. Open Library fallback
    if (!author || isUnknown(author)) {
      author = await fetchOpenLibraryAuthor(book.title);
      await sleep(DELAY_MS);
    }

    if (author && !isUnknown(author)) {
      console.log(`[OK]  "${book.title}"\n      → ${author}`);
      if (!DRY_RUN) {
        try {
          await prisma.book.update({
            where: { id: book.id },
            data: { author },
          });
          updated++;
        } catch (e) {
          console.error(`      DB error: ${(e as Error).message}`);
          errors++;
        }
      } else {
        updated++;
      }
    } else {
      console.log(`[--]  "${book.title}" — no author found`);
      notFound++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Updated  : ${updated}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Errors   : ${errors}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
