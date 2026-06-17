import { FastifyBaseLogger, FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { MoviesService } from "../movies/movies.service";
import { BooksService } from "../books/books.service";
import { MusicService } from "../music/music.service";
import { MangaService } from "../books/manga.service";
import { TvShowsService } from "../tv-shows/tv-shows.service";

const globalSearchSchema = z.object({
  q: z.string().trim().min(2),
  movieLimit: z.coerce.number().int().min(1).max(24).default(12),
  tvLimit: z.coerce.number().int().min(1).max(24).default(8),
  bookLimit: z.coerce.number().int().min(1).max(24).default(8),
  musicLimit: z.coerce.number().int().min(1).max(24).default(8),
  mangaLimit: z.coerce.number().int().min(1).max(24).default(12),
});

type SearchLimits = z.infer<typeof globalSearchSchema>;

type MediaResults = {
  movies: Array<Record<string, unknown> & { id?: string }>;
  tvShows: Array<Record<string, unknown> & { id?: string }>;
  books: Array<Record<string, unknown> & { id?: string }>;
  music: Array<Record<string, unknown> & { id?: string }>;
  manga: Array<Record<string, unknown> & { id?: string }>;
};

type SearchServices = {
  moviesService: MoviesService;
  tvShowsService: TvShowsService;
  booksService: BooksService;
  musicService: MusicService;
  mangaService: MangaService;
};

// Deduplicate items by id, preserving first-seen order.
function uniqueById<T extends { id?: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

// Produce fuzzy search tokens from a raw query string (handles typos).
function tokenizeFuzzy(input: string): string[] {
  const words = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
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
}

/**
 * Fan-out search across all media types. Pass `log` to emit error-level logs
 * on service failure (used for the primary search); omit for silent fallbacks.
 *
 * Each arm has its own .catch() so a single service failure (e.g. a Cloudflare
 * block on the manga scraper) doesn't kill the whole response.
 */
async function fetchMediaResults(
  services: SearchServices,
  q: string,
  limits: SearchLimits,
  log?: FastifyBaseLogger,
): Promise<MediaResults> {
  const [m, tv, b, mu, ma] = await Promise.all([
    services.moviesService
      .search({ q, page: 1, limit: limits.movieLimit, sortBy: "popular" })
      .catch((error: unknown) => {
        log?.error({ error }, "Movie search failed");
        return { data: [] as Record<string, unknown>[], total: 0 };
      }),
    services.tvShowsService
      .search({ q, page: 1, limit: limits.tvLimit, sortBy: "trending" })
      .catch((error: unknown) => {
        log?.error({ error }, "TV show search failed");
        return { data: [] as Record<string, unknown>[], meta: { total: 0 } };
      }),
    services.booksService
      .search({ q, page: 1, limit: limits.bookLimit })
      .catch((error: unknown) => {
        log?.error({ error }, "Book search failed");
        return { data: [] as Record<string, unknown>[], total: 0 };
      }),
    services.musicService
      .search({ q, page: 1, limit: limits.musicLimit })
      .catch((error: unknown) => {
        log?.error({ error }, "Music search failed");
        return { videos: [] as Record<string, unknown>[], total: 0 };
      }),
    services.mangaService
      .searchManga(q, limits.mangaLimit, {})
      .catch((error: unknown) => {
        log?.error({ error }, "Manga search failed");
        return [] as Awaited<
          ReturnType<typeof services.mangaService.searchManga>
        >;
      }),
  ]);

  return {
    movies: (m.data || []) as Record<string, unknown>[],
    tvShows: (tv.data || []) as Record<string, unknown>[],
    books: (b.data || []) as Record<string, unknown>[],
    music: (mu.videos || []) as Record<string, unknown>[],
    manga: (ma || []) as Record<string, unknown>[],
  };
}

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const services: SearchServices = {
    moviesService: new MoviesService(fastify.prisma),
    tvShowsService: new TvShowsService(fastify.prisma),
    booksService: new BooksService(fastify.prisma),
    musicService: new MusicService(fastify.prisma),
    mangaService: new MangaService(fastify.prisma),
  };

  // GET /api/v1/search?q=term
  // Unified cross-media search endpoint used by Global Search page.
  app.get(
    "/",
    {
      schema: {
        querystring: globalSearchSchema,
      },
    },
    async (request, reply) => {
      const query = request.query;
      let { movies, tvShows, books, music, manga } = await fetchMediaResults(
        services,
        query.q,
        query,
        fastify.log,
      );
      const totalInitial =
        movies.length +
        tvShows.length +
        books.length +
        music.length +
        manga.length;
      if (totalInitial < 4) {
        const fuzzyTerms = tokenizeFuzzy(query.q);
        for (const term of fuzzyTerms) {
          const fallback = await fetchMediaResults(services, term, query);

          movies = uniqueById([...movies, ...fallback.movies]).slice(
            0,
            query.movieLimit,
          );
          tvShows = uniqueById([...tvShows, ...fallback.tvShows]).slice(
            0,
            query.tvLimit,
          );
          books = uniqueById([...books, ...fallback.books]).slice(
            0,
            query.bookLimit,
          );
          music = uniqueById([...music, ...fallback.music]).slice(
            0,
            query.musicLimit,
          );
          manga = uniqueById([...manga, ...fallback.manga]).slice(
            0,
            query.mangaLimit,
          );

          if (
            movies.length +
              tvShows.length +
              books.length +
              music.length +
              manga.length >=
            8
          ) {
            break;
          }
        }
      }
      return reply.send({
        success: true,
        data: { movies, tvShows, books, music, manga },
        meta: {
          query: query.q,
          counts: {
            movies: movies.length,
            tvShows: tvShows.length,
            books: books.length,
            music: music.length,
            manga: manga.length,
          },
        },
      });
    },
  );
};
