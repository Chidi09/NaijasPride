import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import dotenv from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import axios from "axios";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { StorageService } from "../../apps/api/src/shared/services/storage.service";
import { fetchElsciLightNovelFileStream } from "../../apps/api/src/modules/books/external/elsci/elsci-lightnovels";
import { extractEpubMetadataFromFile } from "../../apps/api/src/modules/books/external/cover-extractor.service";

dotenv.config({ path: path.resolve(__dirname, "../../apps/api/.env") });

const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(parsed, max));
};

const hasArg = (name: string): boolean => process.argv.includes(name);

const readArgValue = (name: string): string | undefined => {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
};

const limit = parsePositiveInt(readArgValue("--limit"), 10_000, 1, 250_000);
const batchSize = parsePositiveInt(readArgValue("--batch"), 500, 1, 2_000);
const writeMode = hasArg("--write");
const dryRun = !writeMode || hasArg("--dry-run");

const UNKNOWN_AUTHOR_MARKERS = new Set([
  "",
  "unknown",
  "unknown author",
  "n/a",
  "na",
  "-",
  "none",
  "tbd",
  "null",
]);

const prisma = new PrismaClient();

type Candidate = {
  id: string;
  slug: string;
  title: string;
  currentAuthor: string;
  proposedAuthor: string;
  source: "description" | "title" | "epub-metadata" | "openlibrary";
};

type OpenLibrarySearchDoc = {
  title?: string;
  author_name?: string[];
};

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const cleanCandidate = (value: string): string => {
  let next = normalizeWhitespace(value)
    .replace(/[|/]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[;,:.\-\s]+$/g, "")
    .trim();

  next = next.replace(/^by\s+/i, "").trim();
  return next;
};

const isLikelyValidAuthor = (value: string): boolean => {
  const candidate = cleanCandidate(value);
  if (candidate.length < 3 || candidate.length > 80) return false;
  if (!/[a-z]/i.test(candidate)) return false;
  if (/^[A-Z]{2,5}$/.test(candidate)) return false;
  if (/https?:\/\//i.test(candidate) || /www\./i.test(candidate)) return false;
  if (/\b(pdf|epub|mobi|chapter|volume|vol\.?\s*\d+)\b/i.test(candidate))
    return false;
  if (/\b(the\s+spirits?)\b/i.test(candidate)) return false;
  if (/\d{4,}/.test(candidate)) return false;
  return true;
};

const extractAuthorFromDescription = (
  description: string | null | undefined,
): string | null => {
  if (!description) return null;

  const patterns = [
    /\bauthor\s*[:\-]\s*([A-Za-z][A-Za-z .,'\-]{2,80})/i,
    /\bwritten\s+by\s+([A-Za-z][A-Za-z .,'\-]{2,80})/i,
    /\bby\s+([A-Za-z][A-Za-z .,'\-]{2,80})(?:[\s,.;]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    const extracted = match?.[1] ? cleanCandidate(match[1]) : "";
    if (extracted && isLikelyValidAuthor(extracted)) {
      return extracted;
    }
  }

  return null;
};

const extractAuthorFromTitle = (title: string): string | null => {
  const match = title.match(/\bby\s+([A-Za-z][A-Za-z .,'\-]{2,80})$/i);
  const extracted = match?.[1] ? cleanCandidate(match[1]) : "";
  if (extracted && isLikelyValidAuthor(extracted)) {
    return extracted;
  }
  return null;
};

const isMissingAuthor = (author: string): boolean =>
  UNKNOWN_AUTHOR_MARKERS.has(normalizeWhitespace(author).toLowerCase());

const stripVolumeNoise = (title: string): string =>
  normalizeWhitespace(
    title
      .replace(/\bvolume\s*\d+\b/gi, " ")
      .replace(/\bvol\.?\s*\d+\b/gi, " ")
      .replace(/\bpart\s*\d+\b/gi, " ")
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/\([^\)]*\)/g, " "),
  );

const normalizeLoose = (value: string): string =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const titleLooksRelated = (
  queryTitle: string,
  resultTitle: string,
): boolean => {
  const q = normalizeLoose(queryTitle);
  const r = normalizeLoose(resultTitle);
  if (!q || !r) return false;
  if (q === r) return true;
  return r.includes(q) || q.includes(r);
};

const resolveAuthorFromOpenLibrary = async (
  title: string,
): Promise<string | null> => {
  const q = stripVolumeNoise(title);
  if (!q || q.length < 3) return null;

  try {
    const response = await axios.get<{ docs?: OpenLibrarySearchDoc[] }>(
      "https://openlibrary.org/search.json",
      {
        params: {
          title: q,
          limit: 5,
        },
        timeout: 12000,
        headers: {
          "User-Agent": "NaijasPride/1.0 (contact@naijaspride.com)",
        },
      },
    );

    const docs = response.data?.docs || [];
    for (const doc of docs) {
      const docTitle = normalizeWhitespace(doc.title || "");
      const candidateAuthor = cleanCandidate((doc.author_name || [])[0] || "");
      if (!docTitle || !candidateAuthor) continue;
      if (!titleLooksRelated(q, docTitle)) continue;
      if (!isLikelyValidAuthor(candidateAuthor)) continue;
      return candidateAuthor;
    }
  } catch {
    return null;
  }

  return null;
};

const openLibraryAuthorCache = new Map<string, string | null>();
let lastOpenLibraryCallAt = 0;

const resolveAuthorFromOpenLibraryWithThrottle = async (
  title: string,
): Promise<string | null> => {
  const cacheKey = normalizeLoose(stripVolumeNoise(title));
  if (!cacheKey) return null;
  if (openLibraryAuthorCache.has(cacheKey)) {
    return openLibraryAuthorCache.get(cacheKey) ?? null;
  }

  // Respect Open Library identified limit (3 req/sec): keep <= 1 request every 350ms.
  const now = Date.now();
  const waitMs = Math.max(0, 350 - (now - lastOpenLibraryCallAt));
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  lastOpenLibraryCallAt = Date.now();
  const resolved = await resolveAuthorFromOpenLibrary(title);
  openLibraryAuthorCache.set(cacheKey, resolved);
  return resolved;
};

const extractDownloadKeyFromUrl = (
  downloadUrl: string | null | undefined,
): string | null => {
  if (!downloadUrl) return null;
  try {
    const url = new URL(downloadUrl, "http://localhost");
    if (!url.pathname.includes("/books/download")) return null;
    const key = (url.searchParams.get("key") || "").trim();
    return key || null;
  } catch {
    const match = downloadUrl.match(/[?&]key=([^&]+)/i);
    if (!match?.[1]) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
};

const extractElsciHrefFromUrl = (
  downloadUrl: string | null | undefined,
): string | null => {
  if (!downloadUrl) return null;
  try {
    const url = new URL(downloadUrl, "http://localhost");
    if (!url.pathname.includes("/books/external/elsci/file")) return null;
    const href = (url.searchParams.get("href") || "").trim();
    if (!href) return null;
    return href.startsWith("/") ? href : `/${href.replace(/^\/+/, "")}`;
  } catch {
    const match = downloadUrl.match(/[?&]href=([^&]+)/i);
    if (!match?.[1]) return null;
    try {
      const href = decodeURIComponent(match[1]).trim();
      return href
        ? href.startsWith("/")
          ? href
          : `/${href.replace(/^\/+/, "")}`
        : null;
    } catch {
      return match[1];
    }
  }
};

const withTempFile = async <T>(
  extension: string,
  work: (filePath: string) => Promise<T>,
): Promise<T> => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "book-author-backfill-"),
  );
  const tempFile = path.join(tempDir, `book.${extension.replace(/^\./, "")}`);
  try {
    return await work(tempFile);
  } finally {
    await fs
      .rm(tempDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
};

const downloadR2BookToFile = async (
  key: string,
  destinationPath: string,
): Promise<void> => {
  const response = await StorageService.getClient().send(
    new GetObjectCommand({
      Bucket: StorageService.getBucket(),
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`R2 returned empty body for key: ${key}`);
  }

  await pipeline(
    response.Body as NodeJS.ReadableStream,
    await fs.open(destinationPath, "w").then((f) => f.createWriteStream()),
  );
};

const extractAuthorFromBookFile = async (book: {
  slug: string;
  publisher: string | null;
  format: string | null;
  downloadUrl: string | null;
}): Promise<string | null> => {
  const format = (book.format || "").trim().toLowerCase();
  if (!format.includes("epub")) return null;

  const elsciHref = extractElsciHrefFromUrl(book.downloadUrl);
  if (elsciHref) {
    return withTempFile("epub", async (tempFile) => {
      const upstream = await fetchElsciLightNovelFileStream(elsciHref);
      await pipeline(
        upstream.stream as NodeJS.ReadableStream,
        await fs.open(tempFile, "w").then((f) => f.createWriteStream()),
      );
      const metadata = await extractEpubMetadataFromFile(tempFile);
      return metadata.author ? cleanCandidate(metadata.author) : null;
    });
  }

  const key = extractDownloadKeyFromUrl(book.downloadUrl);
  if (key && key.toLowerCase().endsWith(".epub")) {
    return withTempFile("epub", async (tempFile) => {
      await downloadR2BookToFile(key, tempFile);
      const metadata = await extractEpubMetadataFromFile(tempFile);
      return metadata.author ? cleanCandidate(metadata.author) : null;
    });
  }

  return null;
};

const run = async () => {
  const where: Prisma.BookWhereInput = {
    status: "active",
  };

  let cursor: string | null = null;
  let scanned = 0;
  const candidates: Candidate[] = [];

  while (scanned < limit) {
    const take = Math.min(batchSize, limit - scanned);
    const books = await prisma.book.findMany({
      where,
      orderBy: { id: "asc" },
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      take,
      select: {
        id: true,
        slug: true,
        title: true,
        author: true,
        description: true,
        publisher: true,
        format: true,
        downloadUrl: true,
      },
    });

    if (books.length === 0) {
      break;
    }

    scanned += books.length;
    cursor = books[books.length - 1]?.id || null;

    for (const book of books) {
      if (!isMissingAuthor(book.author || "")) {
        continue;
      }

      const fromDescription = extractAuthorFromDescription(book.description);
      if (fromDescription) {
        candidates.push({
          id: book.id,
          slug: book.slug,
          title: book.title,
          currentAuthor: book.author,
          proposedAuthor: fromDescription,
          source: "description",
        });
        continue;
      }

      const fromTitle = extractAuthorFromTitle(book.title);
      if (fromTitle) {
        candidates.push({
          id: book.id,
          slug: book.slug,
          title: book.title,
          currentAuthor: book.author,
          proposedAuthor: fromTitle,
          source: "title",
        });
        continue;
      }

      try {
        const fromBookFile = await extractAuthorFromBookFile(book);
        if (fromBookFile && isLikelyValidAuthor(fromBookFile)) {
          candidates.push({
            id: book.id,
            slug: book.slug,
            title: book.title,
            currentAuthor: book.author,
            proposedAuthor: fromBookFile,
            source: "epub-metadata",
          });
          continue;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[BackfillBookAuthors] Skipping ${book.slug} due to metadata fetch error: ${message}`,
        );
      }

      const fromOpenLibrary = await resolveAuthorFromOpenLibraryWithThrottle(
        book.title,
      );
      if (fromOpenLibrary) {
        candidates.push({
          id: book.id,
          slug: book.slug,
          title: book.title,
          currentAuthor: book.author,
          proposedAuthor: fromOpenLibrary,
          source: "openlibrary",
        });
      }
    }
  }

  console.log("[BackfillBookAuthors] Scan complete");
  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "write",
        scanned,
        candidates: candidates.length,
      },
      null,
      2,
    ),
  );

  for (const preview of candidates.slice(0, 20)) {
    console.log(
      `[Candidate] ${preview.slug} :: "${preview.currentAuthor}" -> "${preview.proposedAuthor}" (${preview.source})`,
    );
  }

  if (dryRun || candidates.length === 0) {
    return;
  }

  let updated = 0;
  for (const candidate of candidates) {
    await prisma.book.update({
      where: { id: candidate.id },
      data: { author: candidate.proposedAuthor },
    });
    updated++;
  }

  console.log(
    JSON.stringify(
      {
        updated,
      },
      null,
      2,
    ),
  );
};

run()
  .catch((error) => {
    console.error("[BackfillBookAuthors] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });
