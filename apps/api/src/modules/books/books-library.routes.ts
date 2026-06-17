/**
 * Books Library Routes
 *
 * Handles:
 *  - Book favorites (add / remove / list / check)
 *  - Offline manga chapter records (save / remove / list)
 *  - Offline book records (save / remove / list)
 *  - Manga new-chapter tracking (subscribe / list / mark-seen)
 *
 * All routes are authenticated.
 * Prefix registered in app.ts: /api/v1/library
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPushService } from "../../shared/services/push-notification.service";
import { NotFoundError } from "../../shared/errors/app-error";
import { BooksService } from "./books.service";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const BookFavoriteBodySchema = z.object({
  bookId: z.string().uuid(),
});

const OfflineMangaChapterBodySchema = z.object({
  mangaId: z.string().min(1).max(512),
  mangaTitle: z.string().min(1).max(512),
  chapterId: z.string().min(1).max(512),
  chapterTitle: z.string().max(512).optional(),
  pageCount: z.number().int().min(0).default(0),
  fileSizeBytes: z.number().int().positive().optional(),
});

const OfflineMangaChapterRemoveSchema = z.object({
  chapterId: z.string().min(1).max(512),
});

const OfflineMangaFailureSchema = z.object({
  mangaId: z.string().min(1).max(512),
  mangaTitle: z.string().min(1).max(512),
  chapterId: z.string().min(1).max(512).optional(),
  reason: z.string().trim().min(1).max(280),
});

const OfflineBookBodySchema = z.object({
  bookId: z.string().uuid(),
  format: z.string().min(1).max(32).default("epub"),
  fileSizeBytes: z.number().int().positive().optional(),
});

const OfflineBookRemoveSchema = z.object({
  bookId: z.string().uuid(),
});

const OfflineBookFailureSchema = z.object({
  bookId: z.string().uuid(),
  reason: z.string().trim().min(1).max(280),
});

const MangaChapterCheckBodySchema = z.object({
  mangaId: z.string().min(1).max(512),
  mangaTitle: z.string().min(1).max(512),
  mangaCoverUrl: z.string().url().optional(),
  lastSeenChapterId: z.string().min(1).max(512).optional(),
  lastSeenAt: z.string().datetime().optional(),
});

const MangaChapterCheckMarkSchema = z.object({
  mangaId: z.string().min(1).max(512),
  lastSeenChapterId: z.string().min(1).max(512),
  lastSeenAt: z.string().datetime().optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

export const booksLibraryRoutes = async (app: FastifyInstance) => {
  const booksService = new BooksService(app.prisma);

  // ══════════════════════════════════════════════════════════════════════════
  // BOOK FAVORITES
  // ══════════════════════════════════════════════════════════════════════════

  /** POST /api/v1/library/books/favorites — Add book to favorites */
  app.post("/books/favorites", {
    preHandler: [app.authenticate],
    schema: { body: BookFavoriteBodySchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { bookId } = request.body as z.infer<typeof BookFavoriteBodySchema>;

      const book = await app.prisma.book.findUnique({
        where: { id: bookId },
        select: { id: true, title: true },
      });
      if (!book) throw new NotFoundError("Book");

      const fav = await app.prisma.bookFavorite.upsert({
        where: { userId_bookId: { userId, bookId } },
        update: {},
        create: { userId, bookId },
        select: { id: true, bookId: true, addedAt: true },
      });
      return reply.send({ status: "success", data: fav });
    },
  });

  /** DELETE /api/v1/library/books/favorites/:bookId — Remove from favorites */
  app.delete("/books/favorites/:bookId", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { bookId } = request.params as { bookId: string };
      await app.prisma.bookFavorite.deleteMany({ where: { userId, bookId } });
      return reply.send({
        status: "success",
        message: "Removed from favorites",
      });
    },
  });

  /** GET /api/v1/library/books/favorites — List user's favorite books */
  app.get("/books/favorites", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const favorites = await app.prisma.bookFavorite.findMany({
        where: { userId },
        include: {
          book: {
            select: {
              id: true,
              title: true,
              slug: true,
              author: true,
              coverUrl: true,
              format: true,
              pageCount: true,
              genre: true,
              year: true,
              status: true,
            },
          },
        },
        orderBy: { addedAt: "desc" },
      });
      return reply.send({ status: "success", data: favorites });
    },
  });

  /** GET /api/v1/library/books/favorites/:bookId/check — Is this book favorited? */
  app.get("/books/favorites/:bookId/check", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { bookId } = request.params as { bookId: string };
      const fav = await app.prisma.bookFavorite.findUnique({
        where: { userId_bookId: { userId, bookId } },
      });
      return reply.send({ status: "success", data: { favorited: !!fav } });
    },
  });

  // ══════════════════════════════════════════════════════════════════════════
  // OFFLINE MANGA CHAPTERS
  // ══════════════════════════════════════════════════════════════════════════

  /** POST /api/v1/library/manga/offline — Record a downloaded manga chapter */
  app.post("/manga/offline", {
    preHandler: [app.authenticate],
    schema: { body: OfflineMangaChapterBodySchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const body = request.body as z.infer<
        typeof OfflineMangaChapterBodySchema
      >;

      const saved = await app.prisma.offlineMangaChapter.upsert({
        where: { userId_chapterId: { userId, chapterId: body.chapterId } },
        update: {
          pageCount: body.pageCount,
          fileSizeBytes: body.fileSizeBytes ?? null,
          savedAt: new Date(),
        },
        create: {
          userId,
          mangaId: body.mangaId,
          mangaTitle: body.mangaTitle,
          chapterId: body.chapterId,
          chapterTitle: body.chapterTitle ?? null,
          pageCount: body.pageCount,
          fileSizeBytes: body.fileSizeBytes ?? null,
        },
        select: {
          id: true,
          chapterId: true,
          pageCount: true,
          fileSizeBytes: true,
          savedAt: true,
        },
      });

      getPushService(app.prisma)
        .sendDownloadComplete(
          userId,
          "manga",
          `${body.mangaTitle} - ${body.chapterTitle || body.chapterId}`,
          `/books/manga/${encodeURIComponent(body.mangaId)}`,
        )
        .catch(console.error);

      return reply.send({ status: "success", data: saved });
    },
  });

  /** DELETE /api/v1/library/manga/offline — Remove a downloaded chapter record */
  app.delete("/manga/offline", {
    preHandler: [app.authenticate],
    schema: { body: OfflineMangaChapterRemoveSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { chapterId } = request.body as z.infer<
        typeof OfflineMangaChapterRemoveSchema
      >;
      await app.prisma.offlineMangaChapter.deleteMany({
        where: { userId, chapterId },
      });
      return reply.send({
        status: "success",
        message: "Removed offline chapter record",
      });
    },
  });

  /** POST /api/v1/library/manga/offline/failure — Report a failed chapter download */
  app.post("/manga/offline/failure", {
    preHandler: [app.authenticate],
    schema: { body: OfflineMangaFailureSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const body = request.body as z.infer<typeof OfflineMangaFailureSchema>;

      getPushService(app.prisma)
        .sendDownloadFailed(
          userId,
          "manga",
          `${body.mangaTitle}${body.chapterId ? ` (${body.chapterId})` : ""}`,
          body.reason,
          `/books/manga/${encodeURIComponent(body.mangaId)}`,
        )
        .catch(console.error);

      return reply.send({ status: "success" });
    },
  });

  /** GET /api/v1/library/manga/offline — List all offline manga chapters */
  app.get("/manga/offline", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const chapters = await app.prisma.offlineMangaChapter.findMany({
        where: { userId },
        orderBy: [{ mangaId: "asc" }, { savedAt: "desc" }],
      });
      return reply.send({ status: "success", data: chapters });
    },
  });

  // ══════════════════════════════════════════════════════════════════════════
  // OFFLINE BOOKS
  // ══════════════════════════════════════════════════════════════════════════

  /** POST /api/v1/library/books/offline — Record a downloaded book */
  app.post("/books/offline", {
    preHandler: [app.authenticate],
    schema: { body: OfflineBookBodySchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const body = request.body as z.infer<typeof OfflineBookBodySchema>;

      const book = await app.prisma.book.findUnique({
        where: { id: body.bookId },
        select: { id: true, title: true, slug: true, coverUrl: true },
      });
      if (!book) throw new NotFoundError("Book");

      const saved = await app.prisma.offlineBook.upsert({
        where: { userId_bookId: { userId, bookId: body.bookId } },
        update: {
          fileSizeBytes: body.fileSizeBytes ?? null,
          format: body.format,
          savedAt: new Date(),
        },
        create: {
          userId,
          bookId: body.bookId,
          format: body.format,
          fileSizeBytes: body.fileSizeBytes ?? null,
        },
        select: {
          id: true,
          bookId: true,
          format: true,
          fileSizeBytes: true,
          savedAt: true,
        },
      });

      getPushService(app.prisma)
        .sendDownloadComplete(
          userId,
          "book",
          book.title,
          `/books/${book.slug}`,
          book.coverUrl ?? undefined,
        )
        .catch(console.error);

      return reply.send({ status: "success", data: saved });
    },
  });

  /** DELETE /api/v1/library/books/offline/:bookId — Remove offline book record */
  app.delete("/books/offline/:bookId", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { bookId } = request.params as { bookId: string };
      await app.prisma.offlineBook.deleteMany({ where: { userId, bookId } });
      return reply.send({
        status: "success",
        message: "Removed offline book record",
      });
    },
  });

  /** POST /api/v1/library/books/offline/failure — Report a failed book download */
  app.post("/books/offline/failure", {
    preHandler: [app.authenticate],
    schema: { body: OfflineBookFailureSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const body = request.body as z.infer<typeof OfflineBookFailureSchema>;

      const book = await app.prisma.book.findUnique({
        where: { id: body.bookId },
        select: { title: true, slug: true },
      });

      if (book) {
        getPushService(app.prisma)
          .sendDownloadFailed(
            userId,
            "book",
            book.title,
            body.reason,
            `/books/${book.slug}`,
          )
          .catch(console.error);
      }

      return reply.send({ status: "success" });
    },
  });

  /** GET /api/v1/library/books/offline — List all offline books */
  app.get("/books/offline", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const books = await app.prisma.offlineBook.findMany({
        where: { userId },
        include: {
          book: {
            select: {
              id: true,
              title: true,
              slug: true,
              author: true,
              coverUrl: true,
              format: true,
              pageCount: true,
            },
          },
        },
        orderBy: { savedAt: "desc" },
      });
      return reply.send({ status: "success", data: books });
    },
  });

  // ══════════════════════════════════════════════════════════════════════════
  // MANGA NEW-CHAPTER TRACKING (Subscribe + notify)
  // ══════════════════════════════════════════════════════════════════════════

  /** POST /api/v1/library/manga/chapter-watch — Subscribe to new chapter alerts */
  app.post("/manga/chapter-watch", {
    preHandler: [app.authenticate],
    schema: { body: MangaChapterCheckBodySchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const body = request.body as z.infer<typeof MangaChapterCheckBodySchema>;

      const record = await app.prisma.mangaNewChapterCheck.upsert({
        where: { userId_mangaId: { userId, mangaId: body.mangaId } },
        update: {
          mangaTitle: body.mangaTitle,
          mangaCoverUrl: body.mangaCoverUrl ?? null,
          lastSeenChapterId: body.lastSeenChapterId ?? null,
          lastSeenAt: body.lastSeenAt ? new Date(body.lastSeenAt) : null,
        },
        create: {
          userId,
          mangaId: body.mangaId,
          mangaTitle: body.mangaTitle,
          mangaCoverUrl: body.mangaCoverUrl ?? null,
          lastSeenChapterId: body.lastSeenChapterId ?? null,
          lastSeenAt: body.lastSeenAt ? new Date(body.lastSeenAt) : null,
        },
        select: {
          id: true,
          mangaId: true,
          mangaTitle: true,
          lastSeenChapterId: true,
        },
      });
      return reply.send({ status: "success", data: record });
    },
  });

  /** DELETE /api/v1/library/manga/chapter-watch/:mangaId — Unsubscribe */
  app.delete("/manga/chapter-watch/:mangaId", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { mangaId } = request.params as { mangaId: string };
      await app.prisma.mangaNewChapterCheck.deleteMany({
        where: { userId, mangaId },
      });
      return reply.send({
        status: "success",
        message: "Unsubscribed from chapter alerts",
      });
    },
  });

  /** GET /api/v1/library/manga/chapter-watch — List subscriptions */
  app.get("/manga/chapter-watch", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const watches = await app.prisma.mangaNewChapterCheck.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });
      return reply.send({ status: "success", data: watches });
    },
  });

  /** PATCH /api/v1/library/manga/chapter-watch/mark-seen — Update lastSeen after reading */
  app.patch("/manga/chapter-watch/mark-seen", {
    preHandler: [app.authenticate],
    schema: { body: MangaChapterCheckMarkSchema },
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const { mangaId, lastSeenChapterId, lastSeenAt } =
        request.body as z.infer<typeof MangaChapterCheckMarkSchema>;

      await app.prisma.mangaNewChapterCheck.updateMany({
        where: { userId, mangaId },
        data: {
          lastSeenChapterId,
          lastSeenAt: lastSeenAt ? new Date(lastSeenAt) : new Date(),
        },
      });
      return reply.send({ status: "success" });
    },
  });

  // ══════════════════════════════════════════════════════════════════════════
  // UNIFIED LIBRARY SUMMARY
  // ══════════════════════════════════════════════════════════════════════════

  /** GET /api/v1/library/summary — One call for all library counts */
  app.get("/summary", {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const userId = request.user.userId;
      const [
        bookFavCount,
        mangaFavCount,
        offlineMangaCount,
        offlineBookCount,
        chapterWatchCount,
      ] = await Promise.all([
        app.prisma.bookFavorite.count({ where: { userId } }),
        app.prisma.mangaFavorite.count({ where: { userId } }),
        app.prisma.offlineMangaChapter.count({ where: { userId } }),
        app.prisma.offlineBook.count({ where: { userId } }),
        app.prisma.mangaNewChapterCheck.count({ where: { userId } }),
      ]);
      return reply.send({
        status: "success",
        data: {
          bookFavCount,
          mangaFavCount,
          offlineMangaCount,
          offlineBookCount,
          chapterWatchCount,
        },
      });
    },
  });
};
