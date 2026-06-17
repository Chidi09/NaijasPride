import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { Prisma } from "@prisma/client";
import { BooksService } from "./books.service";
import { MangaService } from "./manga.service";
import { BookProgressService } from "./book-progress.service";
import { BookHighlightService } from "./book-highlight.service";
import { BookCoverService } from "./book-cover.service";
import { z } from "zod";
import axios from "axios";
import { StorageService } from "../../shared/services/storage.service";
import {
  fetchEpubBooksBookDetail,
  fetchEpubBooksFileStream,
  pickEpubBooksOffer,
  type EpubBooksRequestedFormat,
} from "./external/epubbooks/epubbooks";
import { importEpubBooksCatalog } from "./external/epubbooks/importer";
import {
  discoverElsciLightNovelFiles,
  type ElsciRequestedFormat,
} from "./external/elsci/elsci-lightnovels";
import { importElsciLightNovelsCatalog } from "./external/elsci/importer";
import { enrichBookFromGoogleBooks } from "./external/google-books.service";
import {
  QueueService,
  bookImportQueue,
} from "../../shared/services/queue.service";
import { getPushService } from "../../shared/services/push-notification.service";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import {
  BadRequestError,
  ExternalServiceError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/app-error";

const createBookSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1),
  description: z.string().optional(),
  year: z
    .number()
    .int()
    .min(1400)
    .max(new Date().getFullYear() + 1),
  isbn: z.string().trim().optional(),
  coverUrl: z.string().url().optional(),
  downloadUrl: z.string().trim().min(1).optional(),
  fileSize: z.number().int().positive().optional(),
  format: z.string().trim().min(1).default("PDF"),
  genre: z.array(z.string().trim().min(1)).min(1),
  kind: z.enum(["book", "comic"]).optional(),
  language: z.string().trim().min(1).default("English"),
  pageCount: z.number().int().positive().optional(),
  rating: z.number().min(0).max(10).optional(),
  publisher: z.string().trim().optional(),
});

const mangaSearchSchema = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  tags: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
  status: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
  originalLanguage: z
    .union([z.string().trim(), z.array(z.string().trim())])
    .optional(),
  contentRating: z
    .union([z.string().trim(), z.array(z.string().trim())])
    .optional(),
  demographic: z
    .union([z.string().trim(), z.array(z.string().trim())])
    .optional(),
  sort: z
    .enum([
      "relevance",
      "latestUploadedChapter",
      "followedCount",
      "createdAt",
      "year",
    ])
    .optional(),
  year: z.coerce
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1)
    .optional(),
});

const mangaDiscoverSchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).optional(),
});

const sourceParamSchema = z.object({
  source: z.string().trim().min(1),
});

const sourceMangaParamSchema = z.object({
  source: z.string().trim().min(1),
  mangaId: z.string().trim().min(1),
});

const sourceChapterParamSchema = z.object({
  source: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
});

const sourceMangaQuerySchema = z.object({
  mangaId: z.string().trim().min(1),
});

const sourceSimilarQueryByIdSchema = z.object({
  mangaId: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(12).optional(),
});

const sourceChaptersByIdQuerySchema = z.object({
  mangaId: z.string().trim().min(1),
  language: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const sourcePagesByIdQuerySchema = z.object({
  chapterId: z.string().trim().min(1),
});

const mangaImageProxyQuerySchema = z.object({
  source: z.string().trim().min(1),
  url: z.string().trim().url(),
});

const SCRAPE_RATE_LIMIT = {
  max: 40,
  timeWindow: "1 minute",
};

const SCRAPE_RATE_LIMIT_HEAVY = {
  max: 20,
  timeWindow: "1 minute",
};

// Image proxy serves individual manga page images — a single chapter has 20-50 pages.
// Use a much higher limit so readers don't get rate-limited mid-chapter.
const IMAGE_PROXY_RATE_LIMIT = {
  max: 500,
  timeWindow: "1 minute",
};

const bookSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
  kind: z.enum(["book", "comic"]).optional(),
});

const lightNovelSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
});

const lightNovelSeriesParamSchema = z.object({
  slug: z.string().trim().min(1),
});

const bookUploadUrlSchema = z.object({
  fileName: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
});

const bookDownloadSchema = z.object({
  key: z.string().trim().min(1),
  disposition: z
    .enum(["inline", "attachment"])
    .optional()
    .default("attachment"),
});

const bookFileParamSchema = z.object({
  slug: z.string().trim().min(1),
});

const bookFileQuerySchema = z.object({
  disposition: z.enum(["inline", "attachment"]).optional().default("inline"),
  // Only relevant for epubBooks (EPUB vs Kindle).
  format: z.enum(["epub", "kindle"]).optional(),
});

const bookProgressParamSchema = z.object({
  slug: z.string().trim().min(1),
});

const bookProgressUpsertSchema = z.object({
  slug: z.string().trim().min(1),
  // For PDFs: real page number (1-based). For EPUBs: epub.js location index + 1.
  page: z.number().int().min(1).max(10_000_000),
});

const highlightColorSchema = z.enum(["yellow", "green", "blue", "pink"]);

const highlightRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

const bookHighlightCreateSchema = z
  .object({
    id: z.string().trim().min(8).optional(),
    kind: z.enum(["epub", "pdf"]),
    color: highlightColorSchema,
    cfiRange: z.string().trim().min(1).optional(),
    excerpt: z.string().trim().max(800).optional(),
    page: z.number().int().min(1).max(10_000_000).optional(),
    rect: highlightRectSchema.optional(),
    createdAt: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "epub") {
      if (!value.cfiRange) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cfiRange is required for epub highlights",
          path: ["cfiRange"],
        });
      }
      return;
    }

    if (value.kind === "pdf") {
      if (!value.page) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "page is required for pdf highlights",
          path: ["page"],
        });
      }
      if (!value.rect) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "rect is required for pdf highlights",
          path: ["rect"],
        });
      }
    }
  });

const bookHighlightDeleteParamSchema = z.object({
  slug: z.string().trim().min(1),
  highlightId: z.string().trim().min(1),
});

const epubBooksParamSchema = z.object({
  externalSlug: z
    .string()
    .trim()
    .min(3)
    .regex(/^\d+-[a-z0-9-]+$/i, "Invalid epubBooks book slug"),
});

const epubBooksFileQuerySchema = z.object({
  format: z.enum(["epub", "kindle"]).optional().default("epub"),
  disposition: z
    .enum(["inline", "attachment"])
    .optional()
    .default("attachment"),
});

const epubBooksImportSchema = z.object({
  startPage: z.coerce.number().int().min(1).default(1),
  endPage: z.coerce.number().int().min(1).max(500).default(1),
  sort: z.enum(["title", "released"]).optional().default("title"),
  maxBooks: z.coerce.number().int().min(1).max(5000).optional(),
  concurrency: z.coerce.number().int().min(1).max(6).optional().default(3),
  dryRun: z.coerce.boolean().optional().default(false),
});

const elsciDiscoverSchema = z.object({
  maxFiles: z.coerce.number().int().min(1).max(2000).optional().default(30),
  formatPreference: z.enum(["epub", "pdf", "any"]).optional().default("epub"),
  includePattern: z.string().trim().max(200).optional(),
  excludePattern: z.string().trim().max(200).optional(),
  rootPath: z.string().trim().min(1).max(500).optional(),
});

const elsciFileQuerySchema = z.object({
  href: z.string().trim().min(2),
  disposition: z
    .enum(["inline", "attachment"])
    .optional()
    .default("attachment"),
});

const elsciImportSchema = z.object({
  maxBooks: z.coerce.number().int().min(1).max(2000).optional().default(120),
  formatPreference: z.enum(["epub", "pdf", "any"]).optional().default("epub"),
  includePattern: z.string().trim().max(200).optional(),
  excludePattern: z.string().trim().max(200).optional(),
  rootPath: z.string().trim().min(1).max(500).optional(),
  dryRun: z.coerce.boolean().optional().default(true),
});

const mangaChaptersSchema = z.object({
  mangaId: z.string().trim().min(1),
});

const mangaChaptersQuerySchema = z.object({
  language: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const mangaPagesSchema = z.object({
  chapterId: z.string().trim().min(1),
});

const mangaCoverSchema = z.object({
  mangaId: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
});

const mangaDetailSchema = z.object({
  mangaId: z.string().trim().min(1),
});

const mangaSimilarQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).optional(),
});

const saveProgressSchema = z.object({
  mangaId: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
  mangaTitle: z.string().trim().max(512).optional(),
  chapterTitle: z.string().trim().max(512).optional(),
  pageIndex: z.number().int().min(0),
  totalPages: z.number().int().min(1),
  isCompleted: z.boolean().optional(),
});

const favoriteSchema = z.object({
  mangaId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  coverUrl: z.string().trim().min(1).optional(),
  status: z.string().optional(),
});

export const bookRoutes = async (
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
) => {
  const booksService = new BooksService(app.prisma);
  const mangaService = new MangaService(app.prisma);
  const bookProgressService = new BookProgressService(app.prisma);
  const bookHighlightService = new BookHighlightService(app.prisma);
  const storageService = new StorageService();
  const queueService = new QueueService();
  const bookCoverService = new BookCoverService(app.prisma, app.log);

  // Lightweight helpers for streaming external files.
  const inferContentTypeFromFilename = (
    filename: string | null,
  ): string | null => {
    const name = (filename || "").toLowerCase();
    if (!name) return null;
    if (name.endsWith(".epub")) return "application/epub+zip";
    if (
      name.endsWith(".mobi") ||
      name.endsWith(".azw") ||
      name.endsWith(".azw3")
    ) {
      return "application/x-mobipocket-ebook";
    }
    if (name.endsWith(".pdf")) return "application/pdf";
    if (name.endsWith(".txt")) return "text/plain; charset=utf-8";
    return null;
  };

  const extractFilenameFromContentDisposition = (
    value: string | string[] | undefined,
  ): string | null => {
    const header = Array.isArray(value) ? value[0] : value;
    if (!header) return null;
    const match = header.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
    if (!match) return null;
    const name = match[1]?.trim();
    if (!name) return null;
    try {
      return decodeURIComponent(name.replace(/^\"|\"$/g, ""));
    } catch {
      return name.replace(/^\"|\"$/g, "");
    }
  };

  const toArray = (value?: string | string[]) => {
    if (!value) return undefined;
    return Array.isArray(value) ? value : [value];
  };

  // Sources whose chapter images must be proxied (CDNs block direct browser requests).
  // WeebCentral aggregates from many scanlation CDNs with unpredictable hostnames, so
  // we allow any external https:// URL for it (SSRF-protected below).
  // readcomicsonline uses a fixed CDN, so we keep a strict allowlist for it.
  const sourceRefererById: Record<string, string> = {
    weebcentral: "https://weebcentral.com/",
    readcomicsonline: "https://readcomicsonline.ru/",
  };

  // Hosts that must never be proxied — our own infrastructure (SSRF protection).
  const BLOCKED_PROXY_HOSTS = [
    "naijaspride.com",
    "api.naijaspride.com",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
  ];

  // Strict allowlist for sources with a known, fixed CDN.
  const strictHostAllowlist: Record<string, string[]> = {
    readcomicsonline: ["readcomicsonline.ru"],
  };

  const shouldProxySourceReaderImages = (sourceId: string) =>
    sourceId === "weebcentral" || sourceId === "readcomicsonline";

  const isAllowedReaderImageUrl = (sourceId: string, rawUrl: string) => {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return false;
    }

    if (parsed.protocol !== "https:") return false;

    const host = parsed.hostname.toLowerCase();

    // SSRF: never proxy requests to our own infrastructure.
    if (
      BLOCKED_PROXY_HOSTS.some(
        (blocked) => host === blocked || host.endsWith(`.${blocked}`),
      )
    ) {
      return false;
    }

    // WeebCentral: allow any external https:// host — scanlation CDNs are unpredictable.
    if (sourceId === "weebcentral") return true;

    // All other sources: strict host allowlist.
    const allowedHosts = strictHostAllowlist[sourceId] || [];
    return allowedHosts.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  };

  const toReaderProxyUrl = (sourceId: string, pageUrl: string) =>
    `/api/v1/books/manga/image?source=${encodeURIComponent(sourceId)}&url=${encodeURIComponent(pageUrl)}`;

  const sanitizeStorageFilename = (fileName: string) =>
    fileName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "book-file";

  const extractDownloadKeyFromUrl = (downloadUrl: string): string | null => {
    if (!downloadUrl) return null;
    try {
      const url = new URL(downloadUrl, "http://localhost");
      // Accept both /api/v1/books/download and /api/books/download etc.
      if (
        !url.pathname.endsWith("/books/download") &&
        !url.pathname.includes("/books/download")
      ) {
        return null;
      }
      const key = url.searchParams.get("key");
      return key ? key.trim() : null;
    } catch {
      const match = downloadUrl.match(/[?&]key=([^&]+)/i);
      if (!match) return null;
      try {
        return decodeURIComponent(match[1] || "");
      } catch {
        return match[1] || null;
      }
    }
  };

  const extractElsciHrefFromUrl = (downloadUrl: string): string | null => {
    if (!downloadUrl) return null;
    try {
      const url = new URL(downloadUrl, "http://localhost");
      if (!url.pathname.includes("/books/external/elsci/file")) {
        return null;
      }
      const href = (url.searchParams.get("href") || "").trim();
      if (!href) return null;
      return href.startsWith("/") ? href : `/${href.replace(/^\/+/, "")}`;
    } catch {
      const match = downloadUrl.match(/[?&]href=([^&]+)/i);
      if (!match) return null;
      try {
        const decoded = decodeURIComponent(match[1] || "").trim();
        if (!decoded) return null;
        return decoded.startsWith("/")
          ? decoded
          : `/${decoded.replace(/^\/+/, "")}`;
      } catch {
        const raw = (match[1] || "").trim();
        if (!raw) return null;
        return raw.startsWith("/") ? raw : `/${raw.replace(/^\/+/, "")}`;
      }
    }
  };

  const getElsciMirrorKeyCandidates = (
    slug: string,
    format?: string | null,
  ): string[] => {
    const normalized = (format || "").toLowerCase();
    const extensions = ["epub", "pdf", "mobi", "azw3"];
    const orderedExt =
      normalized && extensions.includes(normalized)
        ? [normalized, ...extensions.filter((entry) => entry !== normalized)]
        : extensions;
    return orderedExt.map((ext) => `books/elsci/${slug}.${ext}`);
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const mapWithConcurrency = async <T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> => {
    const limit = Math.max(1, Math.min(concurrency, items.length || 1));
    const results: R[] = new Array(items.length);
    let cursor = 0;

    const workers = Array.from({ length: limit }, async () => {
      while (true) {
        const current = cursor++;
        if (current >= items.length) return;
        results[current] = await mapper(items[current] as T, current);
      }
    });

    await Promise.all(workers);
    return results;
  };

  const allowedBookMimeTypes = new Set([
    "application/pdf",
    "application/epub+zip",
    "application/x-mobipocket-ebook",
    "application/vnd.amazon.ebook",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);

  // GET /api/books/manga/search?q=one+piece
  app.get("/manga/search", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      querystring: mangaSearchSchema,
    },
    handler: async (request) => {
      const query = request.query as z.infer<typeof mangaSearchSchema>;
      const data = await mangaService.searchManga(query.q, query.limit ?? 20, {
        tags: toArray(query.tags),
        status: toArray(query.status),
        originalLanguage: toArray(query.originalLanguage),
        contentRating: toArray(query.contentRating),
        demographic: toArray(query.demographic),
        sort: query.sort,
        year: query.year,
      });
      return { success: true, data };
    },
  });

  // GET /api/books/manga/sources
  app.get("/manga/sources", {
    handler: async (_request) => {
      const data = mangaService.getSources();
      return { success: true, data };
    },
  });

  // GET /api/books/manga/sources/health
  app.get("/manga/sources/health", {
    handler: async (_request) => {
      const { sources, solver } = await mangaService.getSourceHealth();
      return { success: true, data: sources, meta: { solver } };
    },
  });

  // GET /api/books/manga/source/:source/search?q=...
  app.get("/manga/source/:source/search", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceParamSchema,
      querystring: mangaSearchSchema,
    },
    handler: async (request) => {
      const { source } = request.params as z.infer<typeof sourceParamSchema>;
      const query = request.query as z.infer<typeof mangaSearchSchema>;
      const data = await mangaService.searchMangaBySource(
        source,
        query.q,
        query.limit ?? 20,
        {
          tags: toArray(query.tags),
          status: toArray(query.status),
          originalLanguage: toArray(query.originalLanguage),
          contentRating: toArray(query.contentRating),
          demographic: toArray(query.demographic),
          sort: query.sort,
          year: query.year,
        },
      );
      return { success: true, data };
    },
  });

  // GET /api/books/manga/source/:source/discover?limit=12
  app.get("/manga/source/:source/discover", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceParamSchema,
      querystring: mangaDiscoverSchema,
    },
    handler: async (request) => {
      const { source } = request.params as z.infer<typeof sourceParamSchema>;
      const { limit } = request.query as z.infer<typeof mangaDiscoverSchema>;
      const data = await mangaService.getDiscoverMangaBySource(
        source,
        limit ?? 12,
      );
      return { success: true, data };
    },
  });

  // GET /api/books/manga/source/:source/tags
  app.get("/manga/source/:source/tags", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceParamSchema,
    },
    handler: async (request) => {
      const { source } = request.params as z.infer<typeof sourceParamSchema>;
      const data = await mangaService.getMangaTagsBySource(source);
      return { success: true, data };
    },
  });

  // GET /api/books/manga/source/:source/detail-by-id?mangaId=...
  // Query-based variant to safely support IDs containing slashes.
  app.get("/manga/source/:source/detail-by-id", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceParamSchema,
      querystring: sourceMangaQuerySchema,
    },
    handler: async (request) => {
      const { source } = request.params as z.infer<typeof sourceParamSchema>;
      const { mangaId } = request.query as z.infer<
        typeof sourceMangaQuerySchema
      >;
      const data = await mangaService.getMangaDetailBySource(source, mangaId);
      if (!data) {
        throw new NotFoundError("Manga");
      }
      return { success: true, data };
    },
  });

  // GET /api/books/manga/source/:source/similar-by-id?mangaId=...&limit=6
  app.get("/manga/source/:source/similar-by-id", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceParamSchema,
      querystring: sourceSimilarQueryByIdSchema,
    },
    handler: async (request) => {
      const { source } = request.params as z.infer<typeof sourceParamSchema>;
      const { mangaId, limit } = request.query as z.infer<
        typeof sourceSimilarQueryByIdSchema
      >;
      const data = await mangaService.getSimilarMangaBySource(
        source,
        mangaId,
        limit ?? 6,
      );
      return { success: true, data };
    },
  });

  // GET /api/books/manga/source/:source/chapters-by-id?mangaId=...&language=...&limit=...
  app.get("/manga/source/:source/chapters-by-id", {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: sourceParamSchema,
      querystring: sourceChaptersByIdQuerySchema,
    },
    handler: async (request) => {
      const { source } = request.params as z.infer<typeof sourceParamSchema>;
      const { mangaId, language, limit } = request.query as z.infer<
        typeof sourceChaptersByIdQuerySchema
      >;
      const normalizedLanguage =
        language?.toLowerCase() === "all" ? undefined : language;
      const data = await mangaService.getChaptersBySource(
        source,
        mangaId,
        normalizedLanguage,
        limit ?? 200,
      );
      return { success: true, data };
    },
  });

  // GET /api/books/manga/source/:source/pages-by-id?chapterId=...
  app.get("/manga/source/:source/pages-by-id", {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: sourceParamSchema,
      querystring: sourcePagesByIdQuerySchema,
    },
    handler: async (request) => {
      const { source } = request.params as z.infer<typeof sourceParamSchema>;
      const { chapterId } = request.query as z.infer<
        typeof sourcePagesByIdQuerySchema
      >;
      const normalizedSource = source.trim().toLowerCase();
      const data = await mangaService.getChapterPagesBySource(
        normalizedSource,
        chapterId,
      );

      const payload = shouldProxySourceReaderImages(normalizedSource)
        ? {
            ...data,
            pages: (data.pages || []).map((pageUrl) =>
              toReaderProxyUrl(normalizedSource, pageUrl),
            ),
          }
        : data;

      return { success: true, data: payload };
    },
  });

  // GET /api/books/manga/source/:source/:mangaId
  app.get("/manga/source/:source/:mangaId", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceMangaParamSchema,
    },
    handler: async (request) => {
      const { source, mangaId } = request.params as z.infer<
        typeof sourceMangaParamSchema
      >;
      const data = await mangaService.getMangaDetailBySource(source, mangaId);
      if (!data) {
        throw new NotFoundError("Manga");
      }
      return { success: true, data };
    },
  });

  // GET /api/books/manga/source/:source/:mangaId/similar?limit=6
  app.get("/manga/source/:source/:mangaId/similar", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceMangaParamSchema,
      querystring: mangaSimilarQuerySchema,
    },
    handler: async (request) => {
      const { source, mangaId } = request.params as z.infer<
        typeof sourceMangaParamSchema
      >;
      const { limit } = request.query as z.infer<
        typeof mangaSimilarQuerySchema
      >;
      const data = await mangaService.getSimilarMangaBySource(
        source,
        mangaId,
        limit ?? 6,
      );
      return { success: true, data };
    },
  });

  // GET /api/books/manga/source/:source/:mangaId/chapters
  app.get("/manga/source/:source/:mangaId/chapters", {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: sourceMangaParamSchema,
      querystring: mangaChaptersQuerySchema,
    },
    handler: async (request) => {
      const { source, mangaId } = request.params as z.infer<
        typeof sourceMangaParamSchema
      >;
      const { language, limit } = request.query as z.infer<
        typeof mangaChaptersQuerySchema
      >;
      const normalizedLanguage =
        language?.toLowerCase() === "all" ? undefined : language;
      const data = await mangaService.getChaptersBySource(
        source,
        mangaId,
        normalizedLanguage,
        limit ?? 200,
      );
      return { success: true, data };
    },
  });

  // GET /api/books/manga/source/:source/chapter/:chapterId/pages
  app.get("/manga/source/:source/chapter/:chapterId/pages", {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: sourceChapterParamSchema,
    },
    handler: async (request) => {
      const { source, chapterId } = request.params as z.infer<
        typeof sourceChapterParamSchema
      >;
      const normalizedSource = source.trim().toLowerCase();
      const data = await mangaService.getChapterPagesBySource(
        normalizedSource,
        chapterId,
      );

      const payload = shouldProxySourceReaderImages(normalizedSource)
        ? {
            ...data,
            pages: (data.pages || []).map((pageUrl) =>
              toReaderProxyUrl(normalizedSource, pageUrl),
            ),
          }
        : data;

      return { success: true, data: payload };
    },
  });

  // GET /api/books/manga/tags
  app.get("/manga/tags", {
    handler: async (_request) => {
      const data = await mangaService.getMangaTags();
      return { success: true, data };
    },
  });

  // GET /api/books/manga/discover?limit=12
  app.get("/manga/discover", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      querystring: mangaDiscoverSchema,
    },
    handler: async (request) => {
      const { limit } = request.query as z.infer<typeof mangaDiscoverSchema>;
      const data = await mangaService.getDiscoverManga(limit ?? 12);
      return { success: true, data };
    },
  });

  // GET /api/books/manga/:mangaId
  app.get("/manga/:mangaId", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: mangaDetailSchema,
    },
    handler: async (request) => {
      const { mangaId } = request.params as z.infer<typeof mangaDetailSchema>;
      const data = await mangaService.getMangaDetail(mangaId);
      if (!data) {
        throw new NotFoundError("Manga");
      }
      return { success: true, data };
    },
  });

  // GET /api/books/manga/:mangaId/similar?limit=6
  app.get("/manga/:mangaId/similar", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: z.object({ mangaId: z.string().trim().min(1) }),
      querystring: mangaSimilarQuerySchema,
    },
    handler: async (request) => {
      const { mangaId } = request.params as { mangaId: string };
      const { limit } = request.query as z.infer<
        typeof mangaSimilarQuerySchema
      >;
      const data = await mangaService.getSimilarManga(mangaId, limit ?? 6);
      return { success: true, data };
    },
  });

  // GET /api/books/manga/:mangaId/chapters
  app.get("/manga/:mangaId/chapters", {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: mangaChaptersSchema,
      querystring: mangaChaptersQuerySchema,
    },
    handler: async (request) => {
      const { mangaId } = request.params as z.infer<typeof mangaChaptersSchema>;
      const { language, limit } = request.query as z.infer<
        typeof mangaChaptersQuerySchema
      >;
      const normalizedLanguage =
        language?.toLowerCase() === "all" ? undefined : language;
      const data = await mangaService.getChapters(
        mangaId,
        normalizedLanguage,
        limit ?? 200,
      );
      return { success: true, data };
    },
  });

  // GET /api/books/manga/chapter/:chapterId/pages
  app.get("/manga/chapter/:chapterId/pages", {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: mangaPagesSchema,
    },
    handler: async (request) => {
      const { chapterId } = request.params as z.infer<typeof mangaPagesSchema>;
      const data = await mangaService.getChapterPages(chapterId);
      return { success: true, data };
    },
  });

  // GET /api/books/manga/covers/:mangaId/:fileName - Proxy MangaDex covers
  app.get("/manga/covers/:mangaId/:fileName", {
    schema: {
      params: mangaCoverSchema,
    },
    handler: async (request, reply) => {
      const { mangaId, fileName } = request.params as z.infer<
        typeof mangaCoverSchema
      >;
      const decodedFileName = decodeURIComponent(fileName);
      const sourceUrl = `https://uploads.mangadex.org/covers/${mangaId}/${decodedFileName}`;

      const response = await axios.get<ArrayBuffer>(sourceUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
      });

      const contentType = response.headers["content-type"] || "image/jpeg";
      reply.header("content-type", contentType);
      reply.header("cache-control", "public, max-age=86400, s-maxage=86400");
      return reply.send(Buffer.from(response.data));
    },
  });

  // GET /api/books/manga/progress/:chapterId - Get reading progress for a chapter
  app.get("/manga/progress/:chapterId", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const { chapterId } = request.params as { chapterId: string };
      const userId = request.user.id;
      const progress = await mangaService.getReadingProgress(userId, chapterId);
      return { success: true, data: progress };
    },
  });

  // POST /api/books/manga/progress - Save reading progress
  app.post("/manga/progress", {
    preHandler: [app.authenticate],
    schema: { body: saveProgressSchema },
    handler: async (request) => {
      const body = request.body as z.infer<typeof saveProgressSchema>;
      const userId = request.user.id;
      const progress = await mangaService.saveReadingProgress(
        userId,
        body.mangaId,
        body.chapterId,
        body.pageIndex,
        body.totalPages,
        body.isCompleted,
        body.mangaTitle,
        body.chapterTitle,
      );
      return { success: true, data: progress };
    },
  });

  // GET /api/books/manga/history - Get user's reading history
  app.get("/manga/history", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const userId = request.user.id;
      const { limit } = request.query as { limit?: string };
      const history = await mangaService.getUserReadingHistory(
        userId,
        limit ? parseInt(limit) : 20,
      );

      const mangaIds = Array.from(new Set(history.map((item) => item.mangaId)));
      const favorites = mangaIds.length
        ? await app.prisma.mangaFavorite.findMany({
            where: { userId, mangaId: { in: mangaIds } },
            select: { mangaId: true, title: true, coverUrl: true },
          })
        : [];

      const favoriteByMangaId = new Map(
        favorites.map((item) => [item.mangaId, item]),
      );

      const enriched = history.map((item) => {
        const favorite = favoriteByMangaId.get(item.mangaId);
        return {
          ...item,
          // Prefer stored mangaTitle from the progress row; fall back to favorite title
          title: item.mangaTitle ?? favorite?.title ?? null,
          coverUrl: favorite?.coverUrl ?? null,
        };
      });

      return { success: true, data: enriched };
    },
  });

  // DELETE /api/books/manga/history/:chapterId - Remove one history entry
  app.delete("/manga/history/:chapterId", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const { chapterId } = request.params as { chapterId: string };
      const userId = request.user.id;
      await mangaService.deleteHistoryEntry(userId, chapterId);
      return { success: true, message: "History entry removed" };
    },
  });

  // DELETE /api/books/manga/history - Clear all reading history
  app.delete("/manga/history", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const userId = request.user.id;
      await mangaService.clearHistory(userId);
      return { success: true, message: "History cleared" };
    },
  });

  // POST /api/books/manga/favorites - Add to favorites
  app.post("/manga/favorites", {
    preHandler: [app.authenticate],
    schema: { body: favoriteSchema },
    handler: async (request) => {
      const body = request.body as z.infer<typeof favoriteSchema>;
      const userId = request.user.id;
      const favorite = await mangaService.addFavorite(
        userId,
        body.mangaId,
        body.title,
        body.coverUrl,
        body.status,
      );
      return { success: true, data: favorite };
    },
  });

  // DELETE /api/books/manga/favorites/:mangaId - Remove from favorites
  app.delete("/manga/favorites/:mangaId", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const { mangaId } = request.params as { mangaId: string };
      const userId = request.user.id;
      await mangaService.removeFavorite(userId, mangaId);
      return { success: true, message: "Removed from favorites" };
    },
  });

  // GET /api/books/manga/favorites - Get user's favorites
  app.get("/manga/favorites", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const userId = request.user.id;
      const favorites = await mangaService.getUserFavorites(userId);
      return { success: true, data: favorites };
    },
  });

  // GET /api/books/manga/favorites/:mangaId/check - Check if manga is favorited
  app.get("/manga/favorites/:mangaId/check", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const { mangaId } = request.params as { mangaId: string };
      const userId = request.user.id;
      const isFav = await mangaService.isFavorite(userId, mangaId);
      return { success: true, data: { isFavorite: isFav } };
    },
  });

  // POST /api/books/upload-url - Generate signed upload URL for book files (Admin only)
  app.post("/upload-url", {
    preHandler: [app.authenticate],
    schema: {
      body: bookUploadUrlSchema,
    },
    handler: async (request, reply) => {
      if (request.user.role !== "ADMIN") {
        throw new ForbiddenError("Admin access required");
      }

      const { fileName, contentType } = request.body as z.infer<
        typeof bookUploadUrlSchema
      >;
      if (!allowedBookMimeTypes.has(contentType)) {
        throw new BadRequestError(`Unsupported file type: ${contentType}`);
      }

      const safeName = sanitizeStorageFilename(fileName);
      const storageKey = `books/${Date.now()}-${safeName}`;
      const uploadUrl = await storageService.getUploadUrl(
        storageKey,
        contentType,
      );
      const downloadUrl = `/api/v1/books/download?key=${encodeURIComponent(storageKey)}`;

      return {
        success: true,
        data: {
          uploadUrl,
          storageKey,
          downloadUrl,
        },
      };
    },
  });

  // === External book files: epubBooks ===
  // GET /api/books/external/epubbooks/:externalSlug - Fetch metadata directly from epubBooks.
  app.get("/external/epubbooks/:externalSlug", {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: epubBooksParamSchema,
    },
    handler: async (request) => {
      const { externalSlug } = request.params as z.infer<
        typeof epubBooksParamSchema
      >;
      const data = await fetchEpubBooksBookDetail(externalSlug);
      return { success: true, data };
    },
  });

  // GET /api/books/external/epubbooks/:externalSlug/file?format=epub|kindle&disposition=inline|attachment
  // Streams the file through our API to avoid CORS + ephemeral links.
  app.get("/external/epubbooks/:externalSlug/file", {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: epubBooksParamSchema,
      querystring: epubBooksFileQuerySchema,
    },
    handler: async (request, reply) => {
      const { externalSlug } = request.params as z.infer<
        typeof epubBooksParamSchema
      >;
      const { format, disposition } = epubBooksFileQuerySchema.parse(
        request.query ?? {},
      );

      const detail = await fetchEpubBooksBookDetail(externalSlug);
      const offer = pickEpubBooksOffer(
        detail.offers,
        format as EpubBooksRequestedFormat,
      );
      if (!offer) {
        throw new NotFoundError("epubBooks download offer");
      }

      const upstream = await fetchEpubBooksFileStream(offer.dlid);
      const upstreamDisposition = upstream.headers["content-disposition"];
      const upstreamFilename =
        extractFilenameFromContentDisposition(upstreamDisposition);
      const fallbackFilename = `${externalSlug}.${format === "kindle" ? "mobi" : "epub"}`;
      const filename = upstreamFilename || fallbackFilename;

      const contentType =
        inferContentTypeFromFilename(filename) ||
        (typeof upstream.headers["content-type"] === "string"
          ? upstream.headers["content-type"]
          : null) ||
        "application/octet-stream";

      const contentLength = upstream.headers["content-length"];
      if (typeof contentLength === "string") {
        reply.header("content-length", contentLength);
      }

      reply.header("content-type", contentType);
      reply.header("cache-control", "private, max-age=0");
      reply.header(
        "content-disposition",
        `${disposition}; filename="${filename.replace(/"/g, "")}"`,
      );
      return reply.send(upstream.stream);
    },
  });

  // POST /api/books/import/epubbooks - Import public-domain books metadata into our DB (Admin only)
  // Note: This stores a stable internal file URL (`/api/v1/books/:slug/file`) and proxies downloads on-demand.
  app.post("/import/epubbooks", {
    preHandler: [app.authenticate],
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      body: epubBooksImportSchema,
    },
    handler: async (request) => {
      if (request.user.role !== "ADMIN") {
        throw new ForbiddenError("Admin access required");
      }

      const payload = epubBooksImportSchema.parse(request.body ?? {});

      // If Redis is available, queue non-dry-run imports to avoid request timeouts.
      const queue = bookImportQueue.get();
      if (queue && !payload.dryRun) {
        const job = await queue.add(
          "import-epubbooks",
          {
            source: "epubbooks",
            mode: "manual",
            options: {
              startPage: payload.startPage,
              endPage: payload.endPage,
              sort: payload.sort,
              maxBooks: payload.maxBooks,
              concurrency: payload.concurrency,
              dryRun: false,
            },
            requestedByUserId: request.user.id,
            requestedAt: Date.now(),
          },
          { removeOnComplete: true, removeOnFail: false },
        );

        return {
          success: true,
          data: {
            mode: "queued",
            jobId: String(job.id),
            queue: "book-import",
          },
        };
      }

      const result = await importEpubBooksCatalog(app.prisma, {
        startPage: payload.startPage,
        endPage: payload.endPage,
        sort: payload.sort,
        maxBooks: payload.maxBooks,
        concurrency: payload.concurrency,
        dryRun: payload.dryRun,
      });

      return { success: true, data: result };
    },
  });

  // GET /api/books/manga/image?source=weebcentral&url=https%3A%2F%2F...
  // Proxies source chapter images through our origin to avoid browser-side hotlink and reader breakage.
  app.get("/manga/image", {
    config: { rateLimit: IMAGE_PROXY_RATE_LIMIT },
    schema: {
      querystring: mangaImageProxyQuerySchema,
    },
    handler: async (request, reply) => {
      const { source, url } = request.query as z.infer<
        typeof mangaImageProxyQuerySchema
      >;
      const sourceId = source.trim().toLowerCase();

      if (!shouldProxySourceReaderImages(sourceId)) {
        throw new BadRequestError(
          "Source image proxy is not enabled for this source",
        );
      }

      if (!isAllowedReaderImageUrl(sourceId, url)) {
        throw new BadRequestError("Image URL is not allowed for this source");
      }

      const response = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: 20_000,
        headers: {
          Referer: sourceRefererById[sourceId],
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        validateStatus: () => true,
      });

      if (response.status < 200 || response.status >= 300) {
        // Some WeebCentral image CDNs intermittently block data-center IPs.
        // Fall back to direct client fetch so residential/mobile clients can still load pages.
        if (sourceId === "weebcentral" && response.status === 403) {
          return reply.redirect(url);
        }

        throw new ExternalServiceError(
          `Upstream image request failed (${response.status})`,
        );
      }

      const contentType = response.headers["content-type"] || "image/jpeg";
      if (!String(contentType).toLowerCase().startsWith("image/")) {
        throw new ExternalServiceError("Upstream resource is not an image");
      }

      reply.header("content-type", String(contentType));
      reply.header("cache-control", "public, max-age=86400, s-maxage=86400");
      return reply.send(Buffer.from(response.data));
    },
  });

  // GET /api/books/external/elsci/discover - Preview light novel files from Elsci index (Admin only)
  app.get("/external/elsci/discover", {
    preHandler: [app.authenticate],
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      querystring: elsciDiscoverSchema,
    },
    handler: async (request) => {
      if (request.user.role !== "ADMIN") {
        throw new ForbiddenError("Admin access required");
      }

      const query = elsciDiscoverSchema.parse(request.query ?? {});
      const files = await discoverElsciLightNovelFiles({
        maxFiles: query.maxFiles,
        formatPreference: query.formatPreference as ElsciRequestedFormat,
        includePattern: query.includePattern,
        excludePattern: query.excludePattern,
        rootPath: query.rootPath,
      });

      return {
        success: true,
        data: files,
        meta: {
          total: files.length,
        },
      };
    },
  });

  // GET /api/books/external/elsci/file?href=...&disposition=inline|attachment
  // DISABLED: Elsci upstream proxy removed — only R2 storage is used.
  app.get("/external/elsci/file", {
    config: { rateLimit: { max: 1, timeWindow: "1 minute" } },
    schema: {
      querystring: elsciFileQuerySchema,
    },
    handler: async (_request, reply) => {
      return reply.status(404).send({
        status: "error",
        message:
          "Elsci upstream proxy disabled. Light novels must be mirrored to R2 storage.",
      });
    },
  });

  // POST /api/books/admin/relink-elsci-r2 — Admin: check R2 storage for all Elsci books that still
  // carry the legacy /external/elsci/file?href=... URL (disabled endpoint) and update their
  // downloadUrl to the real R2 key, or null if not yet mirrored.
  app.post("/admin/relink-elsci-r2", {
    preHandler: [app.authenticate],
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    handler: async (request, reply) => {
      if (request.user.role !== "ADMIN") {
        throw new ForbiddenError("Admin access required");
      }

      const books = await app.prisma.book.findMany({
        where: { downloadUrl: { contains: "/books/external/elsci/file" } },
        select: { id: true, slug: true, format: true },
      });

      let relinked = 0;
      let nulled = 0;
      let failed = 0;
      const relinkLog: Array<{ slug: string; key: string | null }> = [];

      for (const book of books) {
        const candidates = getElsciMirrorKeyCandidates(book.slug, book.format);
        let foundKey: string | null = null;

        for (const key of candidates) {
          try {
            await StorageService.getClient().send(
              new HeadObjectCommand({
                Bucket: StorageService.getBucket(),
                Key: key,
              }),
            );
            foundKey = key;
            break;
          } catch {
            // try next extension
          }
        }

        try {
          const newDownloadUrl = foundKey
            ? `/api/v1/books/download?key=${encodeURIComponent(foundKey)}`
            : null;
          await app.prisma.book.update({
            where: { id: book.id },
            data: { downloadUrl: newDownloadUrl },
          });
          relinkLog.push({ slug: book.slug, key: foundKey });
          if (foundKey) relinked++;
          else nulled++;
        } catch {
          relinkLog.push({ slug: book.slug, key: null });
          failed++;
        }
      }

      return {
        success: true,
        data: {
          total: books.length,
          relinked,
          nulled,
          failed,
          log: relinkLog,
        },
      };
    },
  });

  // POST /api/books/import/elsci-lightnovels - Import light novel metadata from Elsci index (Admin only)
  app.post("/import/elsci-lightnovels", {
    preHandler: [app.authenticate],
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      body: elsciImportSchema,
    },
    handler: async (request) => {
      if (request.user.role !== "ADMIN") {
        throw new ForbiddenError("Admin access required");
      }

      const payload = elsciImportSchema.parse(request.body ?? {});

      const queue = bookImportQueue.get();
      if (queue && !payload.dryRun) {
        const job = await queue.add(
          "import-elsci-lightnovels",
          {
            source: "elsci-lightnovels",
            mode: "manual",
            options: {
              maxBooks: payload.maxBooks,
              formatPreference: payload.formatPreference,
              includePattern: payload.includePattern,
              excludePattern: payload.excludePattern,
              rootPath: payload.rootPath,
              dryRun: false,
            },
            requestedByUserId: request.user.id,
            requestedAt: Date.now(),
          },
          { removeOnComplete: true, removeOnFail: false },
        );

        return {
          success: true,
          data: {
            mode: "queued",
            jobId: String(job.id),
            queue: "book-import",
          },
        };
      }

      const result = await importElsciLightNovelsCatalog(app.prisma, {
        maxBooks: payload.maxBooks,
        formatPreference: payload.formatPreference as ElsciRequestedFormat,
        includePattern: payload.includePattern,
        excludePattern: payload.excludePattern,
        rootPath: payload.rootPath,
        dryRun: payload.dryRun,
      });

      return { success: true, data: result };
    },
  });

  // POST /api/books/import/enrich-authors - Re-enrich books with author='Unknown' via Google Books (Admin only)
  app.post("/import/enrich-authors", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      if (request.user.role !== "ADMIN") {
        throw new ForbiddenError("Admin access required");
      }

      const unknownBooks = await app.prisma.book.findMany({
        where: { author: "Unknown", status: "active" },
        select: { id: true, title: true, year: true },
        take: 200,
      });

      let updated = 0;
      let failed = 0;

      for (const book of unknownBooks) {
        try {
          const enrichment = await enrichBookFromGoogleBooks(
            book.title,
            undefined,
            book.year,
          );
          const resolvedAuthor = enrichment.author?.trim();
          if (resolvedAuthor && resolvedAuthor.toLowerCase() !== "unknown") {
            await app.prisma.book.update({
              where: { id: book.id },
              data: {
                author: resolvedAuthor,
                ...(enrichment.coverUrl && { coverUrl: enrichment.coverUrl }),
                ...(enrichment.description &&
                  enrichment.description.length >= 32 && {
                    description: enrichment.description,
                  }),
              },
            });
            updated++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
        // Avoid hammering Google Books API
        await new Promise((r) => setTimeout(r, 120));
      }

      return {
        success: true,
        data: { total: unknownBooks.length, updated, failed },
      };
    },
  });

  const importJobParamSchema = z.object({
    jobId: z.string().trim().min(1),
  });

  // GET /api/books/import/jobs/:jobId - Inspect queued import job state (Admin only)
  app.get("/import/jobs/:jobId", {
    preHandler: [app.authenticate],
    schema: {
      params: importJobParamSchema,
    },
    handler: async (request, reply) => {
      if (request.user.role !== "ADMIN") {
        throw new ForbiddenError("Admin access required");
      }

      const queue = bookImportQueue.get();
      if (!queue) {
        return reply.status(503).send({
          status: "error",
          message: "Redis queue is not configured (REDIS_URL not set)",
        });
      }

      const { jobId } = request.params as z.infer<typeof importJobParamSchema>;
      const job = await queue.getJob(jobId);
      if (!job) {
        throw new NotFoundError("Import job");
      }

      const state = await job.getState();
      return {
        success: true,
        data: {
          id: String(job.id),
          name: job.name,
          state,
          progress: job.progress,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          failedReason: job.failedReason,
          returnValue: job.returnvalue,
        },
      };
    },
  });

  // GET /progress/recent — Dashboard: recently-read books (for "Continue Reading")
  app.get("/progress/recent", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const userId = request.user.id;
      const { limit } = request.query as { limit?: string };
      const take = Math.min(20, Math.max(1, parseInt(limit || "10") || 10));

      const data = await bookProgressService.listRecent(userId, take);
      return { success: true, data };
    },
  });

  // === Book Reading Progress (server-side) ===
  // Stored in BookProgress.page (1-based). For EPUB we store locationIndex+1.
  app.get("/progress/:slug", {
    preHandler: [app.authenticate],
    schema: {
      params: bookProgressParamSchema,
    },
    handler: async (request) => {
      const { slug } = request.params as z.infer<
        typeof bookProgressParamSchema
      >;
      const userId = request.user.id;

      const data = await bookProgressService.getProgress(userId, slug);
      return { success: true, data };
    },
  });

  app.post("/progress", {
    preHandler: [app.authenticate],
    schema: {
      body: bookProgressUpsertSchema,
    },
    handler: async (request) => {
      const userId = request.user.id;
      const { slug, page } = request.body as z.infer<
        typeof bookProgressUpsertSchema
      >;

      const data = await bookProgressService.upsertProgress(userId, slug, page);
      return { success: true, data };
    },
  });

  // === Book Highlights (server-side) ===
  // Stored per-user; supports EPUB cfiRange highlights and PDF rect highlights.
  app.get("/highlights/:slug", {
    preHandler: [app.authenticate],
    schema: {
      params: bookProgressParamSchema,
    },
    handler: async (request) => {
      const { slug } = request.params as z.infer<
        typeof bookProgressParamSchema
      >;
      const userId = request.user.id;

      const data = await bookHighlightService.listHighlights(userId, slug);
      return { success: true, data };
    },
  });

  app.post("/highlights/:slug", {
    preHandler: [app.authenticate],
    schema: {
      params: bookProgressParamSchema,
      body: bookHighlightCreateSchema,
    },
    handler: async (request) => {
      const { slug } = request.params as z.infer<
        typeof bookProgressParamSchema
      >;
      const userId = request.user.id;
      const payload = bookHighlightCreateSchema.parse(request.body ?? {});

      const data = await bookHighlightService.createHighlight(
        userId,
        slug,
        payload,
      );
      return { success: true, data };
    },
  });

  app.delete("/highlights/:slug/:highlightId", {
    preHandler: [app.authenticate],
    schema: {
      params: bookHighlightDeleteParamSchema,
    },
    handler: async (request) => {
      const { slug, highlightId } = request.params as z.infer<
        typeof bookHighlightDeleteParamSchema
      >;
      const userId = request.user.id;

      const data = await bookHighlightService.deleteHighlight(
        userId,
        slug,
        highlightId,
      );
      return { success: true, data };
    },
  });

  app.delete("/highlights/:slug", {
    preHandler: [app.authenticate],
    schema: {
      params: bookProgressParamSchema,
    },
    handler: async (request) => {
      const { slug } = request.params as z.infer<
        typeof bookProgressParamSchema
      >;
      const userId = request.user.id;

      const data = await bookHighlightService.deleteAllHighlights(userId, slug);
      return { success: true, data };
    },
  });

  // GET /api/books/download?key=books/... - Stream the book file from R2 directly
  app.get("/download", {
    schema: {
      querystring: bookDownloadSchema,
    },
    handler: async (request, reply) => {
      const { key, disposition } = bookDownloadSchema.parse(
        request.query ?? {},
      );
      if (key.startsWith("http://") || key.startsWith("https://")) {
        return reply.redirect(key);
      }

      // Stream directly from R2 via S3 API (public URL may 403 for books)
      const r2Object = await storageService.getObjectStream(key);
      const filename = key.split("/").pop() || "book";
      const contentType =
        inferContentTypeFromFilename(filename) ||
        r2Object.contentType ||
        "application/octet-stream";

      if (r2Object.contentLength) {
        reply.header("content-length", String(r2Object.contentLength));
      }
      reply.header("content-type", contentType);
      reply.header("cache-control", "private, max-age=3600");
      reply.header(
        "content-disposition",
        `${disposition}; filename="${filename.replace(/"/g, "")}"`,
      );
      return reply.send(r2Object.stream);
    },
  });

  // GET /api/books/cover/:slug - Resolve a cover URL from DB or canonical R2 keys
  app.get("/cover/:slug", {
    schema: {
      params: z.object({ slug: z.string().trim().min(1) }),
    },
    handler: async (request, reply) => {
      try {
        const { slug } = request.params as { slug: string };

        const coverUrl = await bookCoverService.resolveCover(slug);

        if (!coverUrl) {
          return reply
            .status(404)
            .send({ status: "error", message: "Cover not found" });
        }

        return reply.redirect(coverUrl);
      } catch (error) {
        throw new ExternalServiceError("Failed to resolve cover", {
          cause: error,
        });
      }
    },
  });

  // GET /api/books/:slug/file - Stream the actual book file bytes.
  // This avoids client-side CORS issues (EPUB/PDF readers typically need ArrayBuffers).
  app.get("/:slug/file", {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: bookFileParamSchema,
      querystring: bookFileQuerySchema,
    },
    handler: async (request, reply) => {
      try {
        const { slug } = request.params as z.infer<typeof bookFileParamSchema>;
        const { disposition, format } = bookFileQuerySchema.parse(
          request.query ?? {},
        );

        const book = await booksService.findBySlug(slug);
        if (!book) {
          return reply.status(404).send({
            status: "error",
            message: "Book not found",
          });
        }

        // epubBooks imported slugs look like: epubbooks-44-pride-and-prejudice
        const isEpubBooks =
          slug.toLowerCase().startsWith("epubbooks-") ||
          (book.publisher || "").toLowerCase() === "epubbooks";
        if (isEpubBooks) {
          const externalSlug = slug.toLowerCase().startsWith("epubbooks-")
            ? slug.slice("epubbooks-".length)
            : null;
          if (!externalSlug) {
            return reply.status(400).send({
              status: "error",
              message: "Invalid epubBooks slug format",
            });
          }

          // Default to EPUB unless caller explicitly asks for Kindle.
          const effectiveFormat: EpubBooksRequestedFormat = (format ||
            "epub") as EpubBooksRequestedFormat;
          const detail = await fetchEpubBooksBookDetail(externalSlug);
          const offer = pickEpubBooksOffer(detail.offers, effectiveFormat);
          if (!offer) {
            return reply.status(404).send({
              status: "error",
              message: "No download offer available for this epubBooks title",
            });
          }

          const upstream = await fetchEpubBooksFileStream(offer.dlid);
          const upstreamDisposition = upstream.headers["content-disposition"];
          const upstreamFilename =
            extractFilenameFromContentDisposition(upstreamDisposition);
          const fallbackFilename = `${externalSlug}.${effectiveFormat === "kindle" ? "mobi" : "epub"}`;
          const filename = upstreamFilename || fallbackFilename;

          const contentType =
            inferContentTypeFromFilename(filename) ||
            (typeof upstream.headers["content-type"] === "string"
              ? upstream.headers["content-type"]
              : null) ||
            "application/octet-stream";

          const contentLength = upstream.headers["content-length"];
          if (typeof contentLength === "string") {
            reply.header("content-length", contentLength);
          }

          reply.header("content-type", contentType);
          reply.header("cache-control", "private, max-age=0");
          reply.header(
            "content-disposition",
            `${disposition}; filename="${filename.replace(/\"/g, "")}"`,
          );
          return reply.send(upstream.stream);
        }

        // If an Elsci (or any) book's downloadUrl already has a `key=` param,
        // it has been mirrored to R2 — fall through directly to the generic R2
        // streaming path below instead of trying the Elsci proxy.
        const r2KeyFromUrl = book.downloadUrl
          ? extractDownloadKeyFromUrl(book.downloadUrl)
          : null;
        const isElsci =
          slug.toLowerCase().startsWith("elsci-ln-") ||
          (book.publisher || "").toLowerCase() === "elsci";
        if (isElsci && !r2KeyFromUrl) {
          const mirrorCandidates = getElsciMirrorKeyCandidates(
            slug,
            book.format,
          );

          for (const key of mirrorCandidates) {
            try {
              const r2Object = await storageService.getObjectStream(key);

              const fallbackExt =
                key.split(".").pop() ||
                (book.format || "").toLowerCase() ||
                "bin";
              const safeTitle = sanitizeStorageFilename(book.title || slug);
              const effectiveFilename = `${safeTitle}.${fallbackExt}`;
              const contentType =
                inferContentTypeFromFilename(effectiveFilename) ||
                r2Object.contentType ||
                "application/octet-stream";

              if (r2Object.contentLength) {
                reply.header("content-length", String(r2Object.contentLength));
              }

              reply.header("content-type", contentType);
              reply.header("cache-control", "private, max-age=0");
              reply.header(
                "content-disposition",
                `${disposition}; filename="${effectiveFilename.replace(/"/g, "")}"`,
              );
              return reply.send(r2Object.stream);
            } catch {
              // Try next candidate key.
            }
          }

          // Elsci upstream proxy disabled — only R2 storage is used.
          return reply.status(404).send({
            status: "error",
            message: "Light novel not available in storage.",
          });
        }

        // Otherwise, treat as internally hosted (GCS/S3/CDN) via storageKey.
        if (!book.downloadUrl) {
          return reply.status(404).send({
            status: "error",
            message: "This book does not have a downloadable file",
          });
        }

        const key = extractDownloadKeyFromUrl(book.downloadUrl);
        if (!key) {
          const normalizedExternalUrl = (book.downloadUrl || "")
            .trim()
            .replace(/^http:\/\//i, "https://");
          if (normalizedExternalUrl.startsWith("https://")) {
            return reply.redirect(normalizedExternalUrl);
          }
          return reply.status(400).send({
            status: "error",
            message: "Unsupported download URL format for streaming",
          });
        }

        // Stream directly from R2 via S3 API (public URL may 403 for books)
        const r2Object = await storageService.getObjectStream(key);

        const fallbackExt =
          (book.format || "").toLowerCase() === "pdf"
            ? "pdf"
            : (book.format || "").toLowerCase() === "epub"
              ? "epub"
              : "bin";
        const safeTitle = sanitizeStorageFilename(book.title || "book");
        const effectiveFilename = `${safeTitle}.${fallbackExt}`;

        const contentType =
          inferContentTypeFromFilename(effectiveFilename) ||
          r2Object.contentType ||
          "application/octet-stream";

        if (r2Object.contentLength) {
          reply.header("content-length", String(r2Object.contentLength));
        }

        reply.header("content-type", contentType);
        reply.header("cache-control", "private, max-age=0");
        reply.header(
          "content-disposition",
          `${disposition}; filename="${effectiveFilename.replace(/"/g, "")}"`,
        );
        return reply.send(r2Object.stream);
      } catch (error) {
        throw new ExternalServiceError("Failed to stream book file", {
          cause: error,
        });
      }
    },
  });

  // GET /api/books/:slug/check-access - Check if book file is accessible (lightweight check)
  app.get("/:slug/check-access", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    schema: {
      params: bookFileParamSchema,
    },
    handler: async (request, reply) => {
      try {
        const { slug } = request.params as z.infer<typeof bookFileParamSchema>;

        const book = await booksService.findBySlug(slug);
        if (!book) {
          return reply.status(404).send({
            status: "error",
            message: "Book not found",
          });
        }

        // Check if book has a download URL
        if (!book.downloadUrl) {
          return reply.status(404).send({
            status: "error",
            message: "Book has no downloadable file",
          });
        }

        // For epubBooks, we can't cheaply preflight upstream without opening a full stream.
        const isEpubBooks =
          slug.toLowerCase().startsWith("epubbooks-") ||
          (book.publisher || "").toLowerCase() === "epubbooks";
        const isElsci =
          slug.toLowerCase().startsWith("elsci-ln-") ||
          (book.publisher || "").toLowerCase() === "elsci";

        if (isEpubBooks) {
          return reply.status(200).send({
            status: "success",
            accessible: true,
          });
        }

        if (isElsci) {
          const directKey = extractDownloadKeyFromUrl(book.downloadUrl);
          const candidates = directKey
            ? [directKey]
            : getElsciMirrorKeyCandidates(slug, book.format);

          for (const key of candidates) {
            try {
              const probe = await storageService.getObjectStream(key);
              const stream = probe.stream as NodeJS.ReadableStream & {
                destroy?: () => void;
              };
              if (typeof stream.destroy === "function") {
                stream.destroy();
              }
              return reply.status(200).send({
                status: "success",
                accessible: true,
              });
            } catch {
              // Keep probing candidates.
            }
          }

          return reply.status(503).send({
            status: "error",
            accessible: false,
            message:
              "Light novel is not mirrored to storage and upstream may be unavailable.",
          });
        }

        // For internally hosted books, try to get a signed URL to verify it exists
        try {
          const key = extractDownloadKeyFromUrl(book.downloadUrl);
          if (!key) {
            return reply.status(400).send({
              status: "error",
              message: "Invalid download URL format",
            });
          }

          // Just verify we can generate a signed URL (doesn't guarantee the file exists in storage)
          await storageService.getDownloadUrl(key);

          return reply.status(200).send({
            status: "success",
            accessible: true,
          });
        } catch {
          return reply.status(404).send({
            status: "error",
            message: "File not accessible",
          });
        }
      } catch (error) {
        throw new ExternalServiceError("Failed to check file accessibility", {
          cause: error,
        });
      }
    },
  });

  // GET /api/books - Search books with pagination
  app.get("/", async (request) => {
    const { page, limit, q, kind } = bookSearchSchema.parse(
      request.query ?? {},
    );

    const result = await booksService.search({
      page: page ?? 1,
      limit: limit ?? 20,
      q,
      kind,
    });

    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  });

  // GET /api/books/light-novels - Grouped light novel series with sorted volumes
  app.get("/light-novels", async (request) => {
    const { page, limit, q } = lightNovelSearchSchema.parse(
      request.query ?? {},
    );
    const result = await booksService.listLightNovelSeries({
      page: page ?? 1,
      limit: limit ?? 20,
      q,
    });

    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  });

  // GET /api/books/light-novels/:slug/volumes - Volumes for the same series as this slug
  app.get("/light-novels/:slug/volumes", async (request) => {
    const { slug } = lightNovelSeriesParamSchema.parse(request.params ?? {});
    const result = await booksService.getLightNovelSeriesBySlug(slug);

    if (!result) {
      throw new NotFoundError("Light novel series");
    }

    return {
      success: true,
      data: result,
    };
  });

  // GET /api/books/:slug - Get book by slug
  app.get("/:slug", async (request) => {
    const { slug } = request.params as { slug: string };
    const book = await booksService.findBySlug(slug);

    if (!book) {
      throw new NotFoundError("Book");
    }

    // Increment view count (fire-and-forget)
    app.prisma.book
      .update({
        where: { id: book.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => {});

    return {
      success: true,
      data: book,
    };
  });

  // POST /api/books - Create new book (Admin only)
  app.post("/", {
    preHandler: [app.authenticate],
    schema: {
      body: createBookSchema,
    },
    handler: async (request, reply) => {
      // Check if user is admin
      const user = request.user;
      if (user.role !== "ADMIN") {
        throw new ForbiddenError("Admin access required");
      }

      const bookPayload = request.body as z.infer<typeof createBookSchema>;
      const { kind, ...basePayload } = bookPayload;

      const normalizedGenre = [...basePayload.genre];
      if (kind === "comic" && !normalizedGenre.includes("Comic")) {
        normalizedGenre.unshift("Comic");
      }
      if (kind === "book") {
        const withoutComic = normalizedGenre.filter(
          (entry) => entry !== "Comic",
        );
        if (withoutComic.length > 0) {
          normalizedGenre.splice(0, normalizedGenre.length, ...withoutComic);
        }
      }

      let book = await booksService.create({
        ...basePayload,
        genre: normalizedGenre,
      });

      // Attempt to extract and upload the cover synchronously so the response
      // already includes coverUrl. We race against a 45-second timeout; if
      // extraction wins we update the local book object. If it times out or
      // fails we fall back to the async queue (same as before).
      if (!book.coverUrl && book.status !== "deleted" && book.downloadUrl) {
        try {
          const INLINE_COVER_TIMEOUT_MS = 45_000;
          const coverResult = await Promise.race([
            bookCoverService.processBookCover(book.id),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), INLINE_COVER_TIMEOUT_MS),
            ),
          ]);

          if (coverResult && coverResult.updated && coverResult.coverUrl) {
            book = { ...book, coverUrl: coverResult.coverUrl };
          } else if (!coverResult) {
            // Timed out — hand off to the queue
            app.log.warn(
              { bookId: book.id },
              "[BookCover] Inline extraction timed out, queuing",
            );
            queueService
              .addBookCoverJob({ bookId: book.id, reason: "manual-create" })
              .catch((error) => {
                app.log.error(
                  { error, bookId: book.id },
                  "[BookCover] Failed to queue cover extraction after timeout",
                );
              });
          }
        } catch (coverError) {
          app.log.error(
            { coverError, bookId: book.id },
            "[BookCover] Inline extraction failed, queuing",
          );
          queueService
            .addBookCoverJob({ bookId: book.id, reason: "manual-create" })
            .catch((error) => {
              app.log.error(
                { error, bookId: book.id },
                "[BookCover] Failed to queue cover extraction after error",
              );
            });
        }
      } else if (!book.coverUrl && book.status !== "deleted") {
        // No downloadUrl yet — queue for later
        queueService
          .addBookCoverJob({ bookId: book.id, reason: "manual-create" })
          .catch((error) => {
            app.log.error(
              { error, bookId: book.id },
              "[BookCover] Failed to queue manual cover extraction",
            );
          });
      }

      app.prisma.pushNotificationToken
        .findMany({
          where: { isActive: true },
          select: { userId: true },
          distinct: ["userId"],
        })
        .then((devices) => {
          const userIds = devices.map((entry) => entry.userId);
          if (userIds.length === 0) return;
          return getPushService(app.prisma).sendNewBook(
            userIds,
            book.title,
            book.slug,
            book.author,
            book.coverUrl ?? undefined,
          );
        })
        .catch(console.error);

      return reply.status(201).send({
        status: "success",
        data: book,
      });
    },
  });

  // Offline Book Management Endpoints

  // POST /api/v1/library/books/offline - Register a book for offline access
  app.post("/library/offline", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const userId = request.user.userId;
      const { bookId, format, fileSizeBytes } = request.body as {
        bookId: string;
        format: string;
        fileSizeBytes: number;
      };

      // Check if book exists
      const book = await app.prisma.book.findUnique({
        where: { id: bookId },
        select: { id: true, title: true },
      });

      if (!book) {
        throw new NotFoundError("Book");
      }

      // Upsert offline book record
      await app.prisma.offlineBook.upsert({
        where: {
          userId_bookId: {
            userId,
            bookId,
          },
        },
        create: {
          userId,
          bookId,
          format,
          fileSizeBytes,
        },
        update: {
          format,
          fileSizeBytes,
        },
      });

      return {
        success: true,
        message: "Book registered for offline access",
      };
    },
  });

  // POST /api/v1/library/books/offline/failure - Report offline download failure
  app.post("/library/offline/failure", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const userId = request.user.userId;
      const { bookId, error: errorMessage } = request.body as {
        bookId: string;
        error: string;
      };

      // Update the offline book status to failed
      await app.prisma.offlineBook.updateMany({
        where: {
          userId,
          bookId,
        },
        data: {
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        message: "Offline failure recorded",
      };
    },
  });

  // DELETE /api/v1/library/books/offline/:bookId - Remove a book from offline access
  app.delete("/library/offline/:bookId", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const userId = request.user.userId;
      const { bookId } = request.params as { bookId: string };

      // Delete the offline book record
      await app.prisma.offlineBook.deleteMany({
        where: {
          userId,
          bookId,
        },
      });

      return {
        success: true,
        message: "Book removed from offline access",
      };
    },
  });

  // GET /api/v1/library/books/offline - List all offline books for user
  app.get("/library/offline", {
    preHandler: [app.authenticate],
    handler: async (request) => {
      const userId = request.user.userId;

      const offlineBooks = await app.prisma.offlineBook.findMany({
        where: {
          userId,
        },
        include: {
          book: {
            select: {
              id: true,
              title: true,
              author: true,
              coverUrl: true,
              slug: true,
            },
          },
        },
        orderBy: {
          savedAt: "desc",
        },
      });

      return {
        success: true,
        data: offlineBooks,
      };
    },
  });
};
