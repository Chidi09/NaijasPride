import axios from 'axios';
import { Genre as PrismaGenre, Quality as PrismaQuality, PrismaClient } from '@prisma/client';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const TMDB_API_BASE = 'https://api.themoviedb.org/3';

type TmdbListItem = { id: number };

type TmdbMovieDetails = {
  id: number;
  title: string;
  release_date?: string | null;
  overview?: string | null;
  tagline?: string | null;
  runtime?: number | null;
  vote_average?: number | null;
  original_language?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: { id: number; name: string }[];
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  videos?: { results?: { key: string; site: string; type: string; official?: boolean }[] };
};

export class MovieTmdbSyncService {
  constructor(private readonly prisma: PrismaClient) {}

  async syncCatalog(opts: {
    pagesPerList?: number;
    maxMovies?: number;
  } = {}): Promise<{ scanned: number; upserted: number; skipped: number; failed: number }> {
    const apiKey = process.env.TMDB_API_KEY || process.env.TMDB_KEY;
    if (!apiKey) {
      console.warn('[MovieTMDB] No TMDB_API_KEY set — skipping sync');
      return { scanned: 0, upserted: 0, skipped: 0, failed: 0 };
    }

    const pagesPerList = opts.pagesPerList ?? this.parsePositiveInt(process.env.MOVIE_TMDB_SYNC_PAGES_PER_LIST, 5);
    const maxMovies = opts.maxMovies ?? this.parsePositiveInt(process.env.MOVIE_TMDB_SYNC_MAX_MOVIES_PER_RUN, 500);

    console.log(`[MovieTMDB] Starting catalog sync: pagesPerList=${pagesPerList}, maxMovies=${maxMovies}`);

    const tmdbIds = await this.fetchDiscoveryIds(apiKey, pagesPerList);
    const cappedIds = tmdbIds.slice(0, maxMovies);

    console.log(`[MovieTMDB] Found ${tmdbIds.length} unique IDs, processing ${cappedIds.length}`);

    let upserted = 0;
    let skipped = 0;
    let failed = 0;

    for (const tmdbId of cappedIds) {
      try {
        const result = await this.upsertMovieByTmdbId(tmdbId, apiKey);
        if (result === 'upserted') upserted++;
        else skipped++;
      } catch (err) {
        console.warn(`[MovieTMDB] Failed to upsert tmdbId=${tmdbId}:`, err instanceof Error ? err.message : err);
        failed++;
      }
      // Gentle rate limiting — TMDB allows ~40 req/10s
      await this.sleep(30);
    }

    console.log(`[MovieTMDB] Done: upserted=${upserted}, skipped=${skipped}, failed=${failed}`);
    return { scanned: cappedIds.length, upserted, skipped, failed };
  }

  private async fetchDiscoveryIds(apiKey: string, pagesPerList: number): Promise<number[]> {
    const ids = new Set<number>();

    const lists = [
      '/trending/movie/day',
      '/trending/movie/week',
      '/movie/popular',
      '/movie/top_rated',
      '/movie/now_playing',
      '/movie/upcoming',
    ];

    for (let page = 1; page <= pagesPerList; page++) {
      const requests = lists.map((path) =>
        axios
          .get<{ results: TmdbListItem[] }>(`${TMDB_API_BASE}${path}`, {
            params: { api_key: apiKey, page },
            timeout: 15000,
          })
          .then((res) => res.data.results ?? [])
          .catch(() => [] as TmdbListItem[]),
      );

      const results = await Promise.all(requests);
      for (const list of results) {
        for (const item of list) {
          if (Number.isInteger(item.id) && item.id > 0) ids.add(item.id);
        }
      }

      // Also pull by genre: Action, Comedy, Drama, Horror, Thriller, Romance
      const genreIds = [28, 35, 18, 27, 53, 10749, 16, 99, 10751, 878];
      const genreRequests = genreIds.map((genreId) =>
        axios
          .get<{ results: TmdbListItem[] }>(`${TMDB_API_BASE}/discover/movie`, {
            params: { api_key: apiKey, page, with_genres: genreId, sort_by: 'popularity.desc', 'vote_count.gte': 50 },
            timeout: 15000,
          })
          .then((res) => res.data.results ?? [])
          .catch(() => [] as TmdbListItem[]),
      );

      const genreResults = await Promise.all(genreRequests);
      for (const list of genreResults) {
        for (const item of list) {
          if (Number.isInteger(item.id) && item.id > 0) ids.add(item.id);
        }
      }
    }

    return Array.from(ids);
  }

  private async upsertMovieByTmdbId(tmdbId: number, apiKey: string): Promise<'upserted' | 'skipped'> {
    const detailsRes = await axios.get<TmdbMovieDetails>(`${TMDB_API_BASE}/movie/${tmdbId}`, {
      params: { api_key: apiKey, append_to_response: 'external_ids,videos' },
      timeout: 15000,
    });

    const d = detailsRes.data;
    if (!d?.title) return 'skipped';

    const year = this.extractYear(d.release_date);
    const slug = this.generateSlug(d.title, year);
    const genres = this.mapGenres(d.genres?.map((g) => g.id) ?? []);
    const imdbId = d.imdb_id || d.external_ids?.imdb_id || null;

    const trailer = d.videos?.results?.find(
      (v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official,
    ) ?? d.videos?.results?.find((v) => v.site === 'YouTube' && v.type === 'Trailer');

    const shared = {
      title: d.title,
      slug,
      overview: d.overview ?? null,
      tagline: d.tagline ?? null,
      year,
      genre: genres,
      quality: [] as PrismaQuality[],
      language: d.original_language ? d.original_language.toUpperCase() : 'EN',
      imdbId,
      thumbnailUrl: this.tmdbImage(d.poster_path, 'w500'),
      posterUrl: this.tmdbImage(d.poster_path, 'w500'),
      backdropUrl: this.tmdbImage(d.backdrop_path, 'original'),
      trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
      durationMinutes: d.runtime && d.runtime > 0 ? d.runtime : null,
      tmdbRating: d.vote_average && d.vote_average > 0 ? Math.round(d.vote_average * 10) : null,
      // No file URLs — streaming via embed providers using tmdbId/imdbId
      fileUrls: {} as Record<string, string>,
      fileSizes: {} as Record<string, number>,
      isStreamOnly: true,
      status: 'active' as const,
    };

    await this.prisma.movie.upsert({
      where: { tmdbId },
      update: {
        title: shared.title,
        overview: shared.overview,
        tagline: shared.tagline,
        year: shared.year,
        genre: shared.genre,
        language: shared.language,
        imdbId: shared.imdbId,
        thumbnailUrl: shared.thumbnailUrl,
        posterUrl: shared.posterUrl,
        backdropUrl: shared.backdropUrl,
        trailerUrl: shared.trailerUrl,
        durationMinutes: shared.durationMinutes,
        tmdbRating: shared.tmdbRating,
        isStreamOnly: true,
        status: 'active',
      },
      create: {
        ...shared,
        tmdbId,
      },
    });

    return 'upserted';
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(raw || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private extractYear(date: string | null | undefined): number {
    if (!date) return new Date().getFullYear();
    const year = Number.parseInt(date.slice(0, 4), 10);
    return Number.isFinite(year) && year >= 1900 ? year : new Date().getFullYear();
  }

  private generateSlug(title: string, year: number): string {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
    return `${base}-${year}`;
  }

  private tmdbImage(path: string | null | undefined, size: 'w500' | 'original'): string | null {
    if (!path) return null;
    return `${TMDB_IMAGE_BASE}/${size}${path}`;
  }

  private mapGenres(tmdbGenreIds: number[]): PrismaGenre[] {
    const out = new Set<PrismaGenre>();
    for (const id of tmdbGenreIds) {
      switch (id) {
        case 28:   out.add(PrismaGenre.Action); break;
        case 12:   out.add(PrismaGenre.Action); break; // Adventure → Action
        case 16:   out.add(PrismaGenre.Animation); break;
        case 35:   out.add(PrismaGenre.Comedy); break;
        case 80:   out.add(PrismaGenre.Thriller); break; // Crime → Thriller
        case 99:   out.add(PrismaGenre.Documentary); break;
        case 18:   out.add(PrismaGenre.Drama); break;
        case 10751: out.add(PrismaGenre.Family); break;
        case 14:   out.add(PrismaGenre.Action); break; // Fantasy → Action
        case 36:   out.add(PrismaGenre.Documentary); break; // History → Documentary
        case 27:   out.add(PrismaGenre.Horror); break;
        case 10402: out.add(PrismaGenre.Drama); break; // Music → Drama
        case 9648: out.add(PrismaGenre.Thriller); break; // Mystery → Thriller
        case 10749: out.add(PrismaGenre.Romance); break;
        case 878:  out.add(PrismaGenre.SciFi); break;
        case 10770: out.add(PrismaGenre.Drama); break; // TV Movie → Drama
        case 53:   out.add(PrismaGenre.Thriller); break;
        case 10752: out.add(PrismaGenre.Action); break; // War → Action
        case 37:   out.add(PrismaGenre.Action); break; // Western → Action
        default:   break;
      }
    }
    if (out.size === 0) out.add(PrismaGenre.Hollywood);
    return Array.from(out);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
