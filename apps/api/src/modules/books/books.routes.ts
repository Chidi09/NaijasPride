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
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const mangaChaptersSchema = z.object({
  mangaId: z.string().trim().min(1),
});

const mangaPagesSchema = z.object({
  chapterId: z.string().trim().min(1),
});

export const bookRoutes = async (
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) => {
  const booksService = new BooksService(app.prisma);
  const mangaService = new MangaService();

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

  // GET /api/books - Search books with pagination
  app.get('/', async (request, reply) => {
    try {
      const { page, limit, q } = request.query as { page?: string; limit?: string; q?: string };
      
      const result = await booksService.search({
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
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
