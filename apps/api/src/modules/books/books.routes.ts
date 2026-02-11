import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { BooksService } from './books.service';
import { MangaService } from './manga.service';
import { z } from 'zod';
import axios from 'axios';

const createBookSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1),
  description: z.string().optional(),
  year: z.number().int().min(1400).max(new Date().getFullYear() + 1),
  isbn: z.string().trim().optional(),
  coverUrl: z.string().url().optional(),
  downloadUrl: z.string().url().optional(),
  fileSize: z.number().int().positive().optional(),
  format: z.string().trim().min(1).default('PDF'),
  genre: z.array(z.string().trim().min(1)).min(1),
  language: z.string().trim().min(1).default('English'),
  pageCount: z.number().int().positive().optional(),
  rating: z.number().min(0).max(10).optional(),
  publisher: z.string().trim().optional(),
});

const mangaSearchSchema = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  tags: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
  status: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
  originalLanguage: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
  contentRating: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
  demographic: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
  sort: z.enum(['relevance', 'latestUploadedChapter', 'followedCount', 'createdAt', 'year']).optional(),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
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

const SCRAPE_RATE_LIMIT = {
  max: 40,
  timeWindow: '1 minute',
};

const SCRAPE_RATE_LIMIT_HEAVY = {
  max: 20,
  timeWindow: '1 minute',
};

const bookSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
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
  _opts: FastifyPluginOptions
) => {
  const booksService = new BooksService(app.prisma);
  const mangaService = new MangaService(app.prisma);

  const toArray = (value?: string | string[]) => {
    if (!value) return undefined;
    return Array.isArray(value) ? value : [value];
  };

  // GET /api/books/manga/search?q=one+piece
  app.get('/manga/search', {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      querystring: mangaSearchSchema,
    },
    handler: async (request, reply) => {
      try {
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
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to search manga',
        });
      }
    },
  });

  // GET /api/books/manga/sources
  app.get('/manga/sources', {
    handler: async (_request, reply) => {
      try {
        const data = mangaService.getSources();
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch manga sources',
        });
      }
    },
  });

  // GET /api/books/manga/sources/health
  app.get('/manga/sources/health', {
    handler: async (_request, reply) => {
      try {
        const { sources, solver } = await mangaService.getSourceHealth();
        return reply.send({ status: 'success', data: sources, meta: { solver } });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch manga source health',
        });
      }
    },
  });

  // GET /api/books/manga/source/:source/search?q=...
  app.get('/manga/source/:source/search', {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceParamSchema,
      querystring: mangaSearchSchema,
    },
    handler: async (request, reply) => {
      try {
        const { source } = request.params as z.infer<typeof sourceParamSchema>;
        const query = request.query as z.infer<typeof mangaSearchSchema>;
        const data = await mangaService.searchMangaBySource(source, query.q, query.limit ?? 20, {
          tags: toArray(query.tags),
          status: toArray(query.status),
          originalLanguage: toArray(query.originalLanguage),
          contentRating: toArray(query.contentRating),
          demographic: toArray(query.demographic),
          sort: query.sort,
          year: query.year,
        });
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to search manga source',
        });
      }
    },
  });

  // GET /api/books/manga/source/:source/discover?limit=12
  app.get('/manga/source/:source/discover', {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceParamSchema,
      querystring: mangaDiscoverSchema,
    },
    handler: async (request, reply) => {
      try {
        const { source } = request.params as z.infer<typeof sourceParamSchema>;
        const { limit } = request.query as z.infer<typeof mangaDiscoverSchema>;
        const data = await mangaService.getDiscoverMangaBySource(source, limit ?? 12);
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load source discover sections',
        });
      }
    },
  });

  // GET /api/books/manga/source/:source/tags
  app.get('/manga/source/:source/tags', {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceParamSchema,
    },
    handler: async (request, reply) => {
      try {
        const { source } = request.params as z.infer<typeof sourceParamSchema>;
        const data = await mangaService.getMangaTagsBySource(source);
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch manga source tags',
        });
      }
    },
  });

  // GET /api/books/manga/source/:source/:mangaId
  app.get('/manga/source/:source/:mangaId', {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceMangaParamSchema,
    },
    handler: async (request, reply) => {
      try {
        const { source, mangaId } = request.params as z.infer<typeof sourceMangaParamSchema>;
        const data = await mangaService.getMangaDetailBySource(source, mangaId);
        if (!data) {
          return reply.status(404).send({
            status: 'error',
            message: 'Manga not found',
          });
        }
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch manga detail',
        });
      }
    },
  });

  // GET /api/books/manga/source/:source/:mangaId/similar?limit=6
  app.get('/manga/source/:source/:mangaId/similar', {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: sourceMangaParamSchema,
      querystring: mangaSimilarQuerySchema,
    },
    handler: async (request, reply) => {
      try {
        const { source, mangaId } = request.params as z.infer<typeof sourceMangaParamSchema>;
        const { limit } = request.query as z.infer<typeof mangaSimilarQuerySchema>;
        const data = await mangaService.getSimilarMangaBySource(source, mangaId, limit ?? 6);
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch similar manga',
        });
      }
    },
  });

  // GET /api/books/manga/source/:source/:mangaId/chapters
  app.get('/manga/source/:source/:mangaId/chapters', {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: sourceMangaParamSchema,
      querystring: mangaChaptersQuerySchema,
    },
    handler: async (request, reply) => {
      try {
        const { source, mangaId } = request.params as z.infer<typeof sourceMangaParamSchema>;
        const { language, limit } = request.query as z.infer<typeof mangaChaptersQuerySchema>;
        const normalizedLanguage = language?.toLowerCase() === 'all' ? undefined : language;
        const data = await mangaService.getChaptersBySource(source, mangaId, normalizedLanguage, limit ?? 200);
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch source chapters',
        });
      }
    },
  });

  // GET /api/books/manga/source/:source/chapter/:chapterId/pages
  app.get('/manga/source/:source/chapter/:chapterId/pages', {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: sourceChapterParamSchema,
    },
    handler: async (request, reply) => {
      try {
        const { source, chapterId } = request.params as z.infer<typeof sourceChapterParamSchema>;
        const data = await mangaService.getChapterPagesBySource(source, chapterId);
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch source chapter pages',
        });
      }
    },
  });

  // GET /api/books/manga/tags
  app.get('/manga/tags', {
    handler: async (_request, reply) => {
      try {
        const data = await mangaService.getMangaTags();
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch manga tags',
        });
      }
    },
  });

  // GET /api/books/manga/discover?limit=12
  app.get('/manga/discover', {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      querystring: mangaDiscoverSchema,
    },
    handler: async (request, reply) => {
      try {
        const { limit } = request.query as z.infer<typeof mangaDiscoverSchema>;
        const data = await mangaService.getDiscoverManga(limit ?? 12);
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load manga discover sections',
        });
      }
    },
  });

  // GET /api/books/manga/:mangaId
  app.get('/manga/:mangaId', {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: mangaDetailSchema,
    },
    handler: async (request, reply) => {
      try {
        const { mangaId } = request.params as z.infer<typeof mangaDetailSchema>;
        const data = await mangaService.getMangaDetail(mangaId);
        if (!data) {
          return reply.status(404).send({
            status: 'error',
            message: 'Manga not found',
          });
        }
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch manga detail',
        });
      }
    },
  });

  // GET /api/books/manga/:mangaId/similar?limit=6
  app.get('/manga/:mangaId/similar', {
    config: { rateLimit: SCRAPE_RATE_LIMIT },
    schema: {
      params: z.object({ mangaId: z.string().trim().min(1) }),
      querystring: mangaSimilarQuerySchema,
    },
    handler: async (request, reply) => {
      try {
        const { mangaId } = request.params as { mangaId: string };
        const { limit } = request.query as z.infer<typeof mangaSimilarQuerySchema>;
        const data = await mangaService.getSimilarManga(mangaId, limit ?? 6);
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch similar manga',
        });
      }
    },
  });

  // GET /api/books/manga/:mangaId/chapters
  app.get('/manga/:mangaId/chapters', {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: mangaChaptersSchema,
      querystring: mangaChaptersQuerySchema,
    },
    handler: async (request, reply) => {
      try {
        const { mangaId } = request.params as z.infer<typeof mangaChaptersSchema>;
        const { language, limit } = request.query as z.infer<typeof mangaChaptersQuerySchema>;
        const normalizedLanguage = language?.toLowerCase() === 'all' ? undefined : language;
        const data = await mangaService.getChapters(mangaId, normalizedLanguage, limit ?? 200);
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch chapters',
        });
      }
    },
  });

  // GET /api/books/manga/chapter/:chapterId/pages
  app.get('/manga/chapter/:chapterId/pages', {
    config: { rateLimit: SCRAPE_RATE_LIMIT_HEAVY },
    schema: {
      params: mangaPagesSchema,
    },
    handler: async (request, reply) => {
      try {
        const { chapterId } = request.params as z.infer<typeof mangaPagesSchema>;
        const data = await mangaService.getChapterPages(chapterId);
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch chapter pages',
        });
      }
    },
  });

  // GET /api/books/manga/covers/:mangaId/:fileName - Proxy MangaDex covers
  app.get('/manga/covers/:mangaId/:fileName', {
    schema: {
      params: mangaCoverSchema,
    },
    handler: async (request, reply) => {
      try {
        const { mangaId, fileName } = request.params as z.infer<typeof mangaCoverSchema>;
        const decodedFileName = decodeURIComponent(fileName);
        const sourceUrl = `https://uploads.mangadex.org/covers/${mangaId}/${decodedFileName}`;

        const response = await axios.get<ArrayBuffer>(sourceUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
        });

        const contentType = response.headers['content-type'] || 'image/jpeg';
        reply.header('content-type', contentType);
        reply.header('cache-control', 'public, max-age=86400, s-maxage=86400');
        return reply.send(Buffer.from(response.data));
      } catch (error) {
        return reply.status(404).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to fetch manga cover',
        });
      }
    },
  });

  // GET /api/books/manga/progress/:chapterId - Get reading progress for a chapter
  app.get('/manga/progress/:chapterId', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const { chapterId } = request.params as { chapterId: string };
        const userId = request.user.id;
        const progress = await mangaService.getReadingProgress(userId, chapterId);
        return reply.send({ status: 'success', data: progress });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to get reading progress',
        });
      }
    },
  });

  // POST /api/books/manga/progress - Save reading progress
  app.post('/manga/progress', {
    preHandler: [app.authenticate],
    schema: { body: saveProgressSchema },
    handler: async (request, reply) => {
      try {
        const body = request.body as z.infer<typeof saveProgressSchema>;
        const userId = request.user.id;
        const progress = await mangaService.saveReadingProgress(
          userId,
          body.mangaId,
          body.chapterId,
          body.pageIndex,
          body.totalPages,
          body.isCompleted
        );
        return reply.send({ status: 'success', data: progress });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to save reading progress',
        });
      }
    },
  });

  // GET /api/books/manga/history - Get user's reading history
  app.get('/manga/history', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const userId = request.user.id;
        const { limit } = request.query as { limit?: string };
        const history = await mangaService.getUserReadingHistory(userId, limit ? parseInt(limit) : 20);
        return reply.send({ status: 'success', data: history });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to get reading history',
        });
      }
    },
  });

  // DELETE /api/books/manga/history/:chapterId - Remove one history entry
  app.delete('/manga/history/:chapterId', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const { chapterId } = request.params as { chapterId: string };
        const userId = request.user.id;
        await mangaService.deleteHistoryEntry(userId, chapterId);
        return reply.send({ status: 'success', message: 'History entry removed' });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to remove history entry',
        });
      }
    },
  });

  // DELETE /api/books/manga/history - Clear all reading history
  app.delete('/manga/history', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const userId = request.user.id;
        await mangaService.clearHistory(userId);
        return reply.send({ status: 'success', message: 'History cleared' });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to clear history',
        });
      }
    },
  });

  // POST /api/books/manga/favorites - Add to favorites
  app.post('/manga/favorites', {
    preHandler: [app.authenticate],
    schema: { body: favoriteSchema },
    handler: async (request, reply) => {
      try {
        const body = request.body as z.infer<typeof favoriteSchema>;
        const userId = request.user.id;
        const favorite = await mangaService.addFavorite(
          userId,
          body.mangaId,
          body.title,
          body.coverUrl,
          body.status
        );
        return reply.send({ status: 'success', data: favorite });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to add favorite',
        });
      }
    },
  });

  // DELETE /api/books/manga/favorites/:mangaId - Remove from favorites
  app.delete('/manga/favorites/:mangaId', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const { mangaId } = request.params as { mangaId: string };
        const userId = request.user.id;
        await mangaService.removeFavorite(userId, mangaId);
        return reply.send({ status: 'success', message: 'Removed from favorites' });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to remove favorite',
        });
      }
    },
  });

  // GET /api/books/manga/favorites - Get user's favorites
  app.get('/manga/favorites', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const userId = request.user.id;
        const favorites = await mangaService.getUserFavorites(userId);
        return reply.send({ status: 'success', data: favorites });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to get favorites',
        });
      }
    },
  });

  // GET /api/books/manga/favorites/:mangaId/check - Check if manga is favorited
  app.get('/manga/favorites/:mangaId/check', {
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      try {
        const { mangaId } = request.params as { mangaId: string };
        const userId = request.user.id;
        const isFav = await mangaService.isFavorite(userId, mangaId);
        return reply.send({ status: 'success', data: { isFavorite: isFav } });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to check favorite status',
        });
      }
    },
  });

  // GET /api/books - Search books with pagination
  app.get('/', async (request, reply) => {
    try {
      const { page, limit, q } = bookSearchSchema.parse(request.query ?? {});
      
      const result = await booksService.search({
        page: page ?? 1,
        limit: limit ?? 20,
        q
      });

      return reply.send({
        status: 'success',
        data: result.data,
        meta: result.meta
      });
    } catch (error) {
      return reply.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch books'
      });
    }
  });

  // GET /api/books/:slug - Get book by slug
  app.get('/:slug', async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const book = await booksService.findBySlug(slug);

      if (!book) {
        return reply.status(404).send({
          status: 'error',
          message: 'Book not found'
        });
      }

      return reply.send({
        status: 'success',
        data: book
      });
    } catch (error) {
      return reply.status(500).send({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch book'
      });
    }
  });

  // POST /api/books - Create new book (Admin only)
  app.post('/', {
    preHandler: [app.authenticate],
    schema: {
      body: createBookSchema,
    },
    handler: async (request, reply) => {
      try {
        // Check if user is admin
        const user = request.user;
        if (user.role !== 'ADMIN') {
          return reply.status(403).send({
            status: 'error',
            message: 'Forbidden: Admin access required'
          });
        }

        const bookPayload = request.body as z.infer<typeof createBookSchema>;
        const book = await booksService.create(bookPayload);
        
        return reply.status(201).send({
          status: 'success',
          data: book
        });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to create book'
        });
      }
    }
  });
};
