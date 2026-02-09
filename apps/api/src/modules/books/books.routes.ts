import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { BooksService } from './books.service';
import { MangaService } from './manga.service';
import { z } from 'zod';

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
});

const mangaDiscoverSchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).optional(),
});

const bookSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().optional(),
});

const mangaChaptersSchema = z.object({
  mangaId: z.string().trim().min(1),
});

const mangaPagesSchema = z.object({
  chapterId: z.string().trim().min(1),
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
  coverUrl: z.string().url().optional(),
  status: z.string().optional(),
});

export const bookRoutes = async (
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) => {
  const booksService = new BooksService(app.prisma);
  const mangaService = new MangaService(app.prisma);

  // GET /api/books/manga/search?q=one+piece
  app.get('/manga/search', {
    schema: {
      querystring: mangaSearchSchema,
    },
    handler: async (request, reply) => {
      try {
        const { q, limit } = request.query as z.infer<typeof mangaSearchSchema>;
        const data = await mangaService.searchManga(q, limit ?? 20);
        return reply.send({ status: 'success', data });
      } catch (error) {
        return reply.status(500).send({
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to search manga',
        });
      }
    },
  });

  // GET /api/books/manga/discover?limit=12
  app.get('/manga/discover', {
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

  // GET /api/books/manga/:mangaId/chapters
  app.get('/manga/:mangaId/chapters', {
    schema: {
      params: mangaChaptersSchema,
    },
    handler: async (request, reply) => {
      try {
        const { mangaId } = request.params as z.infer<typeof mangaChaptersSchema>;
        const data = await mangaService.getChapters(mangaId);
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
