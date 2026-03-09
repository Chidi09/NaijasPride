import axios from 'axios';
import { Genre as PrismaGenre, PrismaClient } from '@prisma/client';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

type TmdbListItem = {
  id: number;
};

type TmdbVideo = {
  key: string;
  site: string;
  type: string;
  official?: boolean;
};

type TmdbSeasonRef = {
  season_number: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
};

type TmdbShowDetails = {
  id: number;
  name: string;
  first_air_date?: string | null;
  overview?: string;
  genres?: { id: number; name: string }[];
  original_language?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  external_ids?: {
    imdb_id?: string | null;
  };
  videos?: {
    results?: TmdbVideo[];
  };
  seasons?: TmdbSeasonRef[];
};

type TmdbSeasonDetails = {
  season_number: number;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  episodes?: {
    episode_number: number;
    name: string;
    overview?: string;
    runtime?: number | null;
    still_path?: string | null;
  }[];
};

export class TvTmdbSyncService {
  constructor(private readonly prisma: PrismaClient) {}

  async syncCatalog(): Promise<{ scanned: number; upserted: number; failed: number }> {
    const apiKey = process.env.TMDB_API_KEY || process.env.TMDB_KEY;
    if (!apiKey) {
      return { scanned: 0, upserted: 0, failed: 0 };
    }

    const maxShows = this.parsePositiveInt(process.env.TV_TMDB_SYNC_MAX_SHOWS_PER_RUN, 50);
    const listPages = this.parsePositiveInt(process.env.TV_TMDB_SYNC_PAGES_PER_LIST, 1);
    const showIds = await this.fetchDiscoveryIds(apiKey, listPages);
    const cappedIds = showIds.slice(0, maxShows);

    let upserted = 0;
    let failed = 0;

    for (const tmdbId of cappedIds) {
      try {
        await this.upsertShowByTmdbId(tmdbId, apiKey);
        upserted++;
      } catch {
        failed++;
      }
    }

    return { scanned: cappedIds.length, upserted, failed };
  }

  private async fetchDiscoveryIds(apiKey: string, pagesPerList: number): Promise<number[]> {
    const ids = new Set<number>();

    for (let page = 1; page <= pagesPerList; page++) {
      const [trending, popular, topRated] = await Promise.all([
        axios.get<{ results: TmdbListItem[] }>('https://api.themoviedb.org/3/trending/tv/day', {
          params: { api_key: apiKey, page },
        }),
        axios.get<{ results: TmdbListItem[] }>('https://api.themoviedb.org/3/tv/popular', {
          params: { api_key: apiKey, page },
        }),
        axios.get<{ results: TmdbListItem[] }>('https://api.themoviedb.org/3/tv/top_rated', {
          params: { api_key: apiKey, page },
        }),
      ]);

      for (const result of [...trending.data.results, ...popular.data.results, ...topRated.data.results]) {
        if (Number.isInteger(result.id) && result.id > 0) ids.add(result.id);
      }
    }

    return Array.from(ids);
  }

  private async upsertShowByTmdbId(tmdbId: number, apiKey: string): Promise<void> {
    const detailsRes = await axios.get<TmdbShowDetails>(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
      params: {
        api_key: apiKey,
        append_to_response: 'external_ids,videos',
      },
    });

    const details = detailsRes.data;
    const year = this.extractYear(details.first_air_date);
    const slug = this.generateSlug(details.name, year);
    const genres = this.mapGenres(details.genres?.map((entry) => entry.id) ?? []);

    const trailer = details.videos?.results?.find(
      (video) => video.site === 'YouTube' && video.type === 'Trailer' && video.official,
    ) ?? details.videos?.results?.find((video) => video.site === 'YouTube' && video.type === 'Trailer');

    const show = await this.prisma.tvShow.upsert({
      where: { tmdbId },
      update: {
        title: details.name,
        slug,
        overview: details.overview ?? null,
        year,
        genre: genres,
        language: details.original_language ? details.original_language.toUpperCase() : 'EN',
        imdbId: details.external_ids?.imdb_id ?? null,
        thumbnailUrl: this.tmdbImage(details.poster_path, 'w500'),
        posterUrl: this.tmdbImage(details.poster_path, 'w500'),
        backdropUrl: this.tmdbImage(details.backdrop_path, 'original'),
        trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
        status: 'active',
      },
      create: {
        title: details.name,
        slug,
        overview: details.overview ?? null,
        year,
        genre: genres,
        language: details.original_language ? details.original_language.toUpperCase() : 'EN',
        imdbId: details.external_ids?.imdb_id ?? null,
        tmdbId,
        thumbnailUrl: this.tmdbImage(details.poster_path, 'w500'),
        posterUrl: this.tmdbImage(details.poster_path, 'w500'),
        backdropUrl: this.tmdbImage(details.backdrop_path, 'original'),
        trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
        status: 'active',
      },
    });

    const seasons = details.seasons ?? [];
    for (const seasonRef of seasons) {
      if (!Number.isInteger(seasonRef.season_number) || seasonRef.season_number < 1) continue;

      const seasonRes = await axios.get<TmdbSeasonDetails>(
        `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonRef.season_number}`,
        { params: { api_key: apiKey } },
      );

      const seasonDetails = seasonRes.data;
      const season = await this.prisma.tvSeason.upsert({
        where: {
          showId_seasonNumber: {
            showId: show.id,
            seasonNumber: seasonRef.season_number,
          },
        },
        update: {
          title: seasonDetails.name ?? seasonRef.name ?? null,
          overview: seasonDetails.overview ?? seasonRef.overview ?? null,
          posterUrl: this.tmdbImage(seasonDetails.poster_path ?? seasonRef.poster_path, 'w500'),
        },
        create: {
          showId: show.id,
          seasonNumber: seasonRef.season_number,
          title: seasonDetails.name ?? seasonRef.name ?? null,
          overview: seasonDetails.overview ?? seasonRef.overview ?? null,
          posterUrl: this.tmdbImage(seasonDetails.poster_path ?? seasonRef.poster_path, 'w500'),
        },
      });

      for (const episode of seasonDetails.episodes ?? []) {
        if (!Number.isInteger(episode.episode_number) || episode.episode_number < 1) continue;
        await this.prisma.tvEpisode.upsert({
          where: {
            seasonId_episodeNumber: {
              seasonId: season.id,
              episodeNumber: episode.episode_number,
            },
          },
          update: {
            title: episode.name,
            overview: episode.overview ?? null,
            durationMinutes: episode.runtime ?? null,
            thumbnailUrl: this.tmdbImage(episode.still_path, 'w500'),
          },
          create: {
            seasonId: season.id,
            episodeNumber: episode.episode_number,
            title: episode.name,
            overview: episode.overview ?? null,
            durationMinutes: episode.runtime ?? null,
            thumbnailUrl: this.tmdbImage(episode.still_path, 'w500'),
          },
        });
      }
    }
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
      .replace(/-+/g, '-');
    return `${base}-${year}`;
  }

  private tmdbImage(path: string | null | undefined, size: 'w500' | 'original'): string | null {
    if (!path) return null;
    return `${TMDB_IMAGE_BASE}/${size}${path}`;
  }

  private mapGenres(tmdbGenreIds: number[]): PrismaGenre[] {
    const out = new Set<PrismaGenre>();
    for (const genreId of tmdbGenreIds) {
      switch (genreId) {
        case 16:
          out.add(PrismaGenre.Animation);
          break;
        case 35:
          out.add(PrismaGenre.Comedy);
          break;
        case 18:
          out.add(PrismaGenre.Drama);
          break;
        case 10749:
          out.add(PrismaGenre.Romance);
          break;
        case 9648:
        case 53:
          out.add(PrismaGenre.Thriller);
          break;
        case 27:
          out.add(PrismaGenre.Horror);
          break;
        case 99:
          out.add(PrismaGenre.Documentary);
          break;
        case 10751:
          out.add(PrismaGenre.Family);
          break;
        case 10765:
        case 10759:
          out.add(PrismaGenre.SciFi);
          out.add(PrismaGenre.Action);
          break;
        default:
          break;
      }
    }
    if (out.size === 0) out.add(PrismaGenre.Hollywood);
    return Array.from(out);
  }
}
