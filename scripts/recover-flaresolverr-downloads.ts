#!/usr/bin/env ts-node
/**
 * recover-flaresolverr-downloads.ts
 *
 * One-shot recovery script: uploads orphaned epub/pdf files from
 * flaresolverr's /app/Downloads (now mounted at FLARESOLVERR_DOWNLOADS_DIR)
 * to R2 and updates the DB downloadUrl for any matched book.
 *
 * Matching strategy (in priority order):
 *   1. Exact title match (case-insensitive)
 *   2. Fuzzy title match — strip publisher tags like "[Yen Press]", dedup suffixes " (N)"
 *
 * Files that cannot be matched to any DB book are uploaded to R2 under
 * books/recovered/<filename> and logged for manual review.
 *
 * Usage (inside API container or with DATABASE_URL + S3_* env vars set):
 *   npx ts-node scripts/recover-flaresolverr-downloads.ts [--dry-run] [--dir /path]
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const DOWNLOADS_DIR =
  process.argv[process.argv.indexOf("--dir") + 1] ||
  process.env.FLARESOLVERR_DOWNLOADS_DIR ||
  "/tmp/flaresolverr-downloads";

const S3_ENDPOINT = process.env.S3_ENDPOINT!;
const S3_REGION = process.env.S3_REGION || "auto";
const S3_BUCKET = process.env.S3_BUCKET!;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID!;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY!;

if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  console.error("Missing S3_* environment variables. Aborting.");
  process.exit(1);
}

// ── S3 Client ─────────────────────────────────────────────────────────────────

const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const uploadToR2 = async (
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> => {
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
};

// ── Title normalization ───────────────────────────────────────────────────────

/**
 * Normalize a filename or book title for fuzzy matching:
 *   - Remove publisher tags like [Yen Press], [J-Novel Club][Premium]
 *   - Remove duplicate-copy suffixes like " (1)", " (12)"
 *   - Remove file extension
 *   - Lowercase, collapse whitespace
 */
const normalizeTitle = (raw: string): string => {
  return raw
    .replace(/\.(epub|pdf|mobi|azw3?)$/i, "") // strip extension
    .replace(/\s*\[[^\]]*\]/g, "") // strip [Publisher] tags
    .replace(/\s*\(\d+\)$/g, "") // strip trailing " (N)" duplicates
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};

// ── Main ──────────────────────────────────────────────────────────────────────

const main = async () => {
  const prisma = new PrismaClient();

  console.log(`[Recover] Downloads dir: ${DOWNLOADS_DIR}`);
  console.log(`[Recover] Dry run: ${DRY_RUN}`);
  console.log("");

  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.error(`[Recover] Directory not found: ${DOWNLOADS_DIR}`);
    process.exit(1);
  }

  // 1. List all epub/pdf files, ignoring .crdownload / partials
  const allFiles = fs
    .readdirSync(DOWNLOADS_DIR)
    .filter((f) => /\.(epub|pdf)$/i.test(f) && !f.includes(".crdownload"));

  // Deduplicate by normalized title — keep only the largest copy
  const byNorm = new Map<string, { file: string; size: number }>();
  for (const file of allFiles) {
    const norm = normalizeTitle(file);
    const filePath = path.join(DOWNLOADS_DIR, file);
    const size = fs.statSync(filePath).size;
    const existing = byNorm.get(norm);
    if (!existing || size > existing.size) {
      byNorm.set(norm, { file, size });
    }
  }

  console.log(
    `[Recover] ${allFiles.length} files found, ${byNorm.size} unique titles after dedup`,
  );

  // 2. Load all books from DB that don't yet have an R2 url
  const books = await prisma.book.findMany({
    where: {
      NOT: { downloadUrl: { startsWith: "/api/v1/books/download" } },
    },
    select: { id: true, title: true, slug: true, format: true },
  });

  console.log(`[Recover] ${books.length} books in DB without R2 URLs`);

  // Build a lookup: normalized title → book
  const bookByNorm = new Map<string, (typeof books)[0]>();
  for (const book of books) {
    bookByNorm.set(normalizeTitle(book.title), book);
  }

  // 3. Process each unique file
  let matched = 0;
  let unmatched = 0;
  let skipped = 0;
  let errors = 0;
  const unmatchedFiles: string[] = [];

  for (const [norm, { file }] of byNorm) {
    const filePath = path.join(DOWNLOADS_DIR, file);
    const ext = path.extname(file).slice(1).toLowerCase();
    const contentType =
      ext === "pdf" ? "application/pdf" : "application/epub+zip";

    const book = bookByNorm.get(norm);

    if (!book) {
      // Try partial match — see if any book title is contained in the filename norm
      let partialMatch: (typeof books)[0] | undefined;
      for (const [bookNorm, b] of bookByNorm) {
        if (norm.includes(bookNorm) || bookNorm.includes(norm)) {
          partialMatch = b;
          break;
        }
      }

      if (!partialMatch) {
        console.log(`[Recover] UNMATCHED: ${file}`);
        unmatchedFiles.push(file);
        unmatched++;

        if (!DRY_RUN) {
          // Upload to recovered/ prefix for manual review
          const recoveredKey = `books/recovered/${file.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          try {
            const buffer = fs.readFileSync(filePath);
            await uploadToR2(recoveredKey, buffer, contentType);
            console.log(`[Recover]   → uploaded to ${recoveredKey}`);
          } catch (err) {
            console.error(
              `[Recover]   Upload failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            errors++;
          }
        }
        continue;
      }

      // Use partial match
      const b = partialMatch;
      const storageKey = `books/${b.slug.startsWith("elsci-") ? "elsci" : "annas"}/${b.slug}.${ext}`;
      console.log(
        `[Recover] PARTIAL MATCH: "${file}" → "${b.title}" (${storageKey})`,
      );

      if (!DRY_RUN) {
        try {
          const buffer = fs.readFileSync(filePath);
          await uploadToR2(storageKey, buffer, contentType);
          const localUrl = `/api/v1/books/download?key=${encodeURIComponent(storageKey)}`;
          await prisma.book.update({
            where: { id: b.id },
            data: { downloadUrl: localUrl, fileSize: buffer.length },
          });
          console.log(`[Recover]   → uploaded and DB updated`);
          matched++;
        } catch (err) {
          console.error(
            `[Recover]   Failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          errors++;
        }
      } else {
        matched++;
      }
      continue;
    }

    // Exact norm match
    const storageKey = `books/${book.slug.startsWith("elsci-") ? "elsci" : "annas"}/${book.slug}.${ext}`;
    console.log(`[Recover] MATCH: "${file}" → "${book.title}" (${storageKey})`);

    if (!DRY_RUN) {
      try {
        const buffer = fs.readFileSync(filePath);
        await uploadToR2(storageKey, buffer, contentType);
        const localUrl = `/api/v1/books/download?key=${encodeURIComponent(storageKey)}`;
        await prisma.book.update({
          where: { id: book.id },
          data: { downloadUrl: localUrl, fileSize: buffer.length },
        });
        console.log(`[Recover]   → uploaded and DB updated`);
        matched++;
      } catch (err) {
        console.error(
          `[Recover]   Failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        errors++;
      }
    } else {
      matched++;
    }
  }

  console.log("");
  console.log("=== Summary ===");
  console.log(`  Matched & uploaded : ${matched}`);
  console.log(`  Unmatched (recovered/) : ${unmatched}`);
  console.log(`  Skipped            : ${skipped}`);
  console.log(`  Errors             : ${errors}`);
  if (unmatchedFiles.length) {
    console.log("");
    console.log(
      "Unmatched files (uploaded to books/recovered/ for manual review):",
    );
    unmatchedFiles.forEach((f) => console.log(`  - ${f}`));
  }

  await prisma.$disconnect();
};

main().catch((err) => {
  console.error("[Recover] Fatal:", err);
  process.exit(1);
});
