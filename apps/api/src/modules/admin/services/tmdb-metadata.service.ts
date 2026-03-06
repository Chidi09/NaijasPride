import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export interface TMDBMovieDetails {
  id: number;
  title: string;
  imdb_id?: string | null;
  overview: string;
  tagline: string;
  runtime: number;
  release_date: string;
  vote_average: number;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { id: number; name: string }[];
  credits?: {
    cast: {
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
    }[];
    crew: {
      id: number;
      name: string;
      job: string;
    }[];
  };
}

export class TMDBMetadataService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Search for a movie on TMDB and return the best match
   */
  async searchMovie(title: string, year?: number): Promise<TMDBMovieDetails | null> {
    if (!TMDB_API_KEY) {
      console.warn('[TMDB] No API key configured');
      return null;
    }

    try {
      const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
        params: {
          api_key: TMDB_API_KEY,
          query: title,
          year: year,
          include_adult: false,
        },
        timeout: 10000,
      });

      const results = response.data?.results || [];
      if (results.length === 0) return null;

      // Get the first result (best match)
      const bestMatch = results[0];
      
      // Fetch full details including credits
      return await this.getMovieDetails(bestMatch.id);
    } catch (error) {
      console.error('[TMDB] Search error:', error);
      return null;
    }
  }

  /**
   * Get full movie details from TMDB including cast and crew
   */
  async getMovieDetails(tmdbId: number): Promise<TMDBMovieDetails | null> {
    if (!TMDB_API_KEY) return null;

    try {
      const response = await axios.get(`${TMDB_BASE_URL}/movie/${tmdbId}`, {
        params: {
          api_key: TMDB_API_KEY,
          append_to_response: 'credits',
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      console.error('[TMDB] Details error:', error);
      return null;
    }
  }

  /**
   * Enrich a movie with TMDB metadata after YouTube import
   */
  async enrichMovieFromTMDB(movieId: string, title: string, year?: number): Promise<void> {
    const tmdbData = await this.searchMovie(title, year);
    
    if (!tmdbData) {
      console.log(`[TMDB] No match found for: ${title}`);
      return;
    }

    console.log(`[TMDB] Found match for: ${title} (TMDB ID: ${tmdbData.id})`);

    // Build update data
    const updateData: any = {
      overview: tmdbData.overview || null,
      tagline: tmdbData.tagline || null,
    };

    // Only update duration if TMDB has it and movie doesn't
    if (tmdbData.runtime > 0) {
      updateData.durationMinutes = tmdbData.runtime;
    }

    // Update rating if available
    if (tmdbData.vote_average > 0) {
      updateData.tmdbRating = Math.round(tmdbData.vote_average * 10);
    }

    // Update images if available
    if (tmdbData.poster_path) {
      updateData.posterUrl = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
    } else {
      const fallbackPoster = await this.getOmdbPoster(tmdbData.imdb_id);
      if (fallbackPoster) {
        updateData.posterUrl = fallbackPoster;
      }
    }
    if (tmdbData.backdrop_path) {
      updateData.backdropUrl = `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}`;
    }

    // Update movie in database
    await this.prisma.movie.update({
      where: { id: movieId },
      data: updateData,
    });

    // Add cast members
    if (tmdbData.credits?.cast && tmdbData.credits.cast.length > 0) {
      const topCast = tmdbData.credits.cast.slice(0, 10); // Top 10 actors
      
      for (const actor of topCast) {
        await this.prisma.cast.create({
          data: {
            name: actor.name,
            character: actor.character || null,
            photoUrl: actor.profile_path 
              ? `https://image.tmdb.org/t/p/w200${actor.profile_path}` 
              : null,
            movieId: movieId,
          },
        });
      }
      
      console.log(`[TMDB] Added ${topCast.length} cast members for: ${title}`);
    }

    console.log(`[TMDB] Successfully enriched: ${title}`);
  }

  /**
   * Auto-find related movies based on genre and year
   */
  async findRelatedMovies(
    movieId: string, 
    genres: string[], 
    year: number,
    limit: number = 5
  ): Promise<{ id: string; title: string; thumbnailUrl: string | null }[]> {
    if (!TMDB_API_KEY) return [];

    try {
      // Find movies from the same year range
      const similarMovies = await this.prisma.movie.findMany({
        where: {
          id: { not: movieId },
          year: { gte: year - 2, lte: year + 2 },
          status: 'active',
        },
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
        },
        take: limit,
        orderBy: { viewCount: 'desc' },
      });

      return similarMovies;
    } catch (error) {
      console.error('[TMDB] Related movies error:', error);
      return [];
    }
  }

  private async getOmdbPoster(imdbId: string | null | undefined): Promise<string | null> {
    if (!OMDB_API_KEY || !imdbId) {
      return null;
    }

    try {
      const response = await axios.get<{ Poster?: string }>('https://www.omdbapi.com/', {
        params: {
          apikey: OMDB_API_KEY,
          i: imdbId,
        },
        timeout: 10000,
      });

      const poster = response.data?.Poster;
      if (!poster || poster === 'N/A') {
        return null;
      }

      const parsed = new URL(poster);
      return parsed.toString();
    } catch {
      return null;
    }
  }
}
