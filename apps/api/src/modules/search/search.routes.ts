import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { MoviesService } from '../movies/movies.service';
import { BooksService } from '../books/books.service';
import { MusicService } from '../music/music.service';
import { MangaService } from '../books/manga.service';

const globalSearchSchema = z.object({
  q: z.string().trim().min(2),
  movieLimit: z.coerce.number().int().min(1).max(24).default(12),
  bookLimit: z.coerce.number().int().min(1).max(24).default(8),
  musicLimit: z.coerce.number().int().min(1).max(24).default(8),
  mangaLimit: z.coerce.number().int().min(1).max(24).default(12),
});

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const moviesService = new MoviesService(fastify.prisma);
  const booksService = new BooksService(fastify.prisma);
  const musicService = new MusicService(fastify.prisma);
  const mangaService = new MangaService(fastify.prisma);

  // GET /api/v1/search?q=term
  // Unified cross-media search endpoint used by Global Search page.
  app.get('/', {
    schema: {
      querystring: globalSearchSchema,
    },
  }, async (request, reply) => {
    try {
      const query = request.query;

      // Each arm has its own .catch() so a single service failure (e.g. manga
      // scraper hitting a Cloudflare block) doesn't kill the whole response.
      const [movies, books, music, manga] = await Promise.all([
        moviesService.search({
          q: query.q,
          page: 1,
          limit: query.movieLimit,
          sortBy: 'popular',
        }).catch((error: unknown) => {
          fastify.log.error({ error }, 'Movie search failed');
          return { data: [], total: 0 };
        }),
        booksService.search({
          q: query.q,
          page: 1,
          limit: query.bookLimit,
        }).catch((error: unknown) => {
          fastify.log.error({ error }, 'Book search failed');
          return { data: [], total: 0 };
        }),
        musicService.search({
          q: query.q,
          page: 1,
          limit: query.musicLimit,
        }).catch((error: unknown) => {
          fastify.log.error({ error }, 'Music search failed');
          return { videos: [], total: 0 };
        }),
        mangaService.searchManga(query.q, query.mangaLimit, {}).catch((error: unknown) => {
          fastify.log.error({ error }, 'Manga search failed');
          return [] as Awaited<ReturnType<typeof mangaService.searchManga>>;
        }),
      ]);

      return reply.send({
        success: true,
        data: {
          movies: movies.data || [],
          books: books.data || [],
          music: music.videos || [],
          manga: manga || [],
        },
        meta: {
          query: query.q,
          counts: {
            movies: movies.data?.length || 0,
            books: books.data?.length || 0,
            music: music.videos?.length || 0,
            manga: manga?.length || 0,
          },
        },
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to run global search',
        },
      });
    }
  });
};
