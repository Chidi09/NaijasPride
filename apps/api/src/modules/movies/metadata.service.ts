import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

type TmdbSearchResult = {
  id: number;
};

type TmdbVideo = {
  key: string;
  site: string;
  type: string;
  official?: boolean;
};

type TmdbCastMember = {
  name: string;
  character?: string;
  profile_path?: string | null;
};

type TmdbMovieDetails = {
  id: number;
  title: string;
  imdb_id: string | null;
  overview?: string;
  tagline?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  credits?: {
    cast?: TmdbCastMember[];
  };
  videos?: {
    results?: TmdbVideo[];
  };
};

type OmdbRating = {
  Source: string;
  Value: string;
};

type OmdbResponse = {
  imdbRating?: string;
  Poster?: string;
  Ratings?: OmdbRating[];
};

export class MetadataService {
  constructor(private readonly prisma: PrismaClient) {}

  async fetchAndSaveMetadata(movieId: string, movieTitle: string, year?: number) {
    // Accept both TMDB_KEY and TMDB_API_KEY so either name works in .env
    const tmdbKey = process.env.TMDB_KEY || process.env.TMDB_API_KEY;
    const omdbKey = process.env.OMDB_KEY;

    if (!tmdbKey) {
      throw new Error('TMDB_KEY (or TMDB_API_KEY) is missing. Set it in your API environment.');
    }

    const searchParams = new URLSearchParams({
      api_key: tmdbKey,
      query: movieTitle,
    });
    if (year) {
      searchParams.set('year', String(year));
    }

    const searchRes = await axios.get<{ results: TmdbSearchResult[] }>(
      `https://api.themoviedb.org/3/search/movie?${searchParams.toString()}`,
    );
    const tmdbResult = searchRes.data.results[0];

    if (!tmdbResult) {
      return { success: false, message: 'No TMDB result found for this title.' };
    }

    const detailsRes = await axios.get<TmdbMovieDetails>(
      `https://api.themoviedb.org/3/movie/${tmdbResult.id}`,
      {
        params: {
          api_key: tmdbKey,
          append_to_response: 'credits,videos,external_ids',
        },
      },
    );

    const details = detailsRes.data;
    let rottenTomatoes: string | null = null;
    let imdbRating: number | null = null;
    let omdbPoster: string | null = null;

    if (details.imdb_id && omdbKey) {
      const omdbRes = await axios.get<OmdbResponse>('https://www.omdbapi.com/', {
        params: {
          apikey: omdbKey,
          i: details.imdb_id,
        },
      });

      const rt = omdbRes.data.Ratings?.find((rating) => rating.Source === 'Rotten Tomatoes');
      rottenTomatoes = rt?.Value ?? null;
      omdbPoster = this.normalizeOmdbPosterUrl(omdbRes.data.Poster);

      if (omdbRes.data.imdbRating && omdbRes.data.imdbRating !== 'N/A') {
        const parsedImdbRating = Number.parseFloat(omdbRes.data.imdbRating);
        imdbRating = Number.isFinite(parsedImdbRating) ? parsedImdbRating : null;
      }
    }

    const youtubeTrailer = details.videos?.results?.find(
      (video) => video.type === 'Trailer' && video.site === 'YouTube' && video.official,
    ) ?? details.videos?.results?.find(
      (video) => video.type === 'Trailer' && video.site === 'YouTube',
    );

    const posterUrl = this.tmdbImage(details.poster_path, 'w500') || omdbPoster;
    const backdropUrl = this.tmdbImage(details.backdrop_path, 'original');

    await this.prisma.movie.update({
      where: { id: movieId },
      data: {
        tmdbId: details.id,
        imdbId: details.imdb_id,
        overview: details.overview ?? null,
        tagline: details.tagline ?? null,
        ...(posterUrl ? { posterUrl } : {}),
        ...(backdropUrl ? { backdropUrl } : {}),
        tmdbRating: details.vote_average ?? null,
        imdbRating,
        rottenTomatoes,
        trailerUrl: youtubeTrailer ? `https://www.youtube.com/watch?v=${youtubeTrailer.key}` : null,
        cast: {
          deleteMany: {},
          create: (details.credits?.cast ?? []).slice(0, 8).map((actor) => ({
            name: actor.name,
            character: actor.character ?? null,
            photoUrl: this.tmdbImage(actor.profile_path ?? null, 'w200'),
          })),
        },
      },
    });

    return { success: true, title: details.title };
  }

  private tmdbImage(path: string | null | undefined, size: 'w200' | 'w500' | 'original') {
    if (!path) {
      return null;
    }

    return `${TMDB_IMAGE_BASE}/${size}${path}`;
  }

  private normalizeOmdbPosterUrl(poster: string | undefined): string | null {
    if (!poster || poster === 'N/A') {
      return null;
    }

    try {
      const parsed = new URL(poster);
      return parsed.toString();
    } catch {
      return null;
    }
  }
}
