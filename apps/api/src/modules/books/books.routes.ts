import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { BooksService } from './books.service';

export const bookRoutes = async (
  app: FastifyInstance,
  opts: FastifyPluginOptions
) => {
  const booksService = new BooksService(app.prisma);

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
    handler: async (request, reply) => {
      try {
        // Check if user is admin
        const user = request.user as any;
        if (user.role !== 'ADMIN') {
          return reply.status(403).send({
            status: 'error',
            message: 'Forbidden: Admin access required'
          });
        }

        const book = await booksService.create(request.body);
        
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
