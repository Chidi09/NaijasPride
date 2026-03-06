import path from 'node:path';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const parsePositiveInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(parsed, max));
};

const hasArg = (name: string): boolean => process.argv.includes(name);

const readArgValue = (name: string): string | undefined => {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
};

const limit = parsePositiveInt(readArgValue('--limit'), 10_000, 1, 250_000);
const batchSize = parsePositiveInt(readArgValue('--batch'), 500, 1, 2_000);
const writeMode = hasArg('--write');
const dryRun = !writeMode || hasArg('--dry-run');

const UNKNOWN_AUTHOR_MARKERS = new Set([
  '',
  'unknown',
  'unknown author',
  'n/a',
  'na',
  '-',
  'none',
  'tbd',
  'null',
]);

const prisma = new PrismaClient();

type Candidate = {
  id: string;
  slug: string;
  title: string;
  currentAuthor: string;
  proposedAuthor: string;
  source: 'description' | 'title';
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const cleanCandidate = (value: string): string => {
  let next = normalizeWhitespace(value)
    .replace(/[|/]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[;,:.\-\s]+$/g, '')
    .trim();

  next = next.replace(/^by\s+/i, '').trim();
  return next;
};

const isLikelyValidAuthor = (value: string): boolean => {
  const candidate = cleanCandidate(value);
  if (candidate.length < 3 || candidate.length > 80) return false;
  if (!/[a-z]/i.test(candidate)) return false;
  if (/https?:\/\//i.test(candidate) || /www\./i.test(candidate)) return false;
  if (/\b(pdf|epub|mobi|chapter|volume|vol\.?\s*\d+)\b/i.test(candidate)) return false;
  if (/\d{4,}/.test(candidate)) return false;
  return true;
};

const extractAuthorFromDescription = (description: string | null | undefined): string | null => {
  if (!description) return null;

  const patterns = [
    /\bauthor\s*[:\-]\s*([A-Za-z][A-Za-z .,'\-]{2,80})/i,
    /\bwritten\s+by\s+([A-Za-z][A-Za-z .,'\-]{2,80})/i,
    /\bby\s+([A-Za-z][A-Za-z .,'\-]{2,80})(?:[\s,.;]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    const extracted = match?.[1] ? cleanCandidate(match[1]) : '';
    if (extracted && isLikelyValidAuthor(extracted)) {
      return extracted;
    }
  }

  return null;
};

const extractAuthorFromTitle = (title: string): string | null => {
  const match = title.match(/\bby\s+([A-Za-z][A-Za-z .,'\-]{2,80})$/i);
  const extracted = match?.[1] ? cleanCandidate(match[1]) : '';
  if (extracted && isLikelyValidAuthor(extracted)) {
    return extracted;
  }
  return null;
};

const isMissingAuthor = (author: string): boolean => UNKNOWN_AUTHOR_MARKERS.has(normalizeWhitespace(author).toLowerCase());

const run = async () => {
  const where: Prisma.BookWhereInput = {
    status: 'active',
  };

  let cursor: string | null = null;
  let scanned = 0;
  const candidates: Candidate[] = [];

  while (scanned < limit) {
    const take = Math.min(batchSize, limit - scanned);
    const books = await prisma.book.findMany({
      where,
      orderBy: { id: 'asc' },
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
      },
    });

    if (books.length === 0) {
      break;
    }

    scanned += books.length;
    cursor = books[books.length - 1]?.id || null;

    for (const book of books) {
      if (!isMissingAuthor(book.author || '')) {
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
          source: 'description',
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
          source: 'title',
        });
      }
    }
  }

  console.log('[BackfillBookAuthors] Scan complete');
  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'write',
        scanned,
        candidates: candidates.length,
      },
      null,
      2,
    ),
  );

  for (const preview of candidates.slice(0, 20)) {
    console.log(`[Candidate] ${preview.slug} :: "${preview.currentAuthor}" -> "${preview.proposedAuthor}" (${preview.source})`);
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
    console.error('[BackfillBookAuthors] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });
