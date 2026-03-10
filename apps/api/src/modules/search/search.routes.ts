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

      const uniqueById = <T extends { id: string }>(items: T[]): T[] => {
        const seen = new Set<string>();
        const out: T[] = [];
        for (const item of items) {
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
          out.push(item);
        }
        return out;
      };

      const tokenizeFuzzy = (input: string): string[] => {
        const words = input
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .map((w) => w.trim())
          .filter((w) => w.length >= 2);

        const variants = new Set<string>();
        for (const word of words) {
          variants.add(word);
          if (word.length >= 4) variants.add(word.slice(0, -1));
          if (word.length >= 5) variants.add(word.slice(0, 3));
        }

        return Array.from(variants).slice(0, 3);
      };

      // Each arm has its own .catch() so a single service failure (e.g. manga
      // scraper hitting a Cloudflare block) doesn't kill the whole response.
      const [moviesInitial, booksInitial, musicInitial, mangaInitial] = await Promise.all([
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

      let movies = moviesInitial.data || [];
      let books = booksInitial.data || [];
      let music = musicInitial.videos || [];
      let manga = mangaInitial || [];

      const totalInitial = movies.length + books.length + music.length + manga.length;

      // Fuzzy fallback when direct query yields little/no results (typos / imperfect input).
      if (totalInitial < 4) {
        const fuzzyTerms = tokenizeFuzzy(query.q);
        if (fuzzyTerms.length > 0) {
          for (const term of fuzzyTerms) {
            const [m2, b2, mu2, ma2] = await Promise.all([
              moviesService.search({
                q: term,
                page: 1,
                limit: query.movieLimit,
                sortBy: 'popular',
              }).catch(() => ({ data: [], total: 0 })),
              booksService.search({
                q: term,
                page: 1,
                limit: query.bookLimit,
              }).catch(() => ({ data: [], total: 0 })),
              musicService.search({
                q: term,
                page: 1,
                limit: query.musicLimit,
              }).catch(() => ({ videos: [], total: 0 })),
              mangaService.searchManga(term, query.mangaLimit, {}).catch(() => [] as Awaited<ReturnType<typeof mangaService.searchManga>>),
            ]);

            movies = uniqueById([...movies, ...(m2.data || [])]).slice(0, query.movieLimit);
            books = uniqueById([...books, ...(b2.data || [])]).slice(0, query.bookLimit);
            music = uniqueById([...music, ...(mu2.videos || [])]).slice(0, query.musicLimit);
            manga = uniqueById([...manga, ...(ma2 || [])]).slice(0, query.mangaLimit);

            if (movies.length + books.length + music.length + manga.length >= 8) {
              break;
            }
          }
        }
      }

      return reply.send({
        success: true,
        data: {
          movies,
          books,
          music,
          manga,
        },
        meta: {
          query: query.q,
          counts: {
            movies: movies.length,
            books: books.length,
            music: music.length,
            manga: manga.length,
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
