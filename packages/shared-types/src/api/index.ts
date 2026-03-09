import { Genre, Quality } from '../enums';
import { MovieMetadata } from '../models/movie';

// --- Requests ---
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface MovieSearchParams extends PaginationParams {
  q?: string;
  genre?: Genre[];
  year?: number;
  quality?: Quality;
  language?: string;
  sortBy?: 'latest' | 'popular' | 'rating' | 'title' | 'trending' | 'newest';
  nollywoodOnly?: boolean;
  isStreamOnly?: boolean;
}

export interface TvShowSearchParams extends PaginationParams {
  q?: string;
  genre?: Genre[];
  year?: number;
  language?: string;
  sortBy?: 'latest' | 'popular' | 'title' | 'trending';
}

export interface CreateMovieRequest {
  title: string;
  description?: string;
  year: number;
  genre: Genre[];
  quality: Quality[];
  language?: string;
  durationMinutes?: number;
  overview?: string;
  tagline?: string;
  tmdbRating?: number;
  imdbRating?: number;
  rottenTomatoes?: string;
  imdbId?: string;
  tmdbId?: number;
  posterUrl?: string;
  backdropUrl?: string;
  trailerUrl?: string;
  fileUrls: Record<string, string>;
  fileSizes?: Record<string, number>;
  metadata?: Partial<MovieMetadata>;
  // Streaming fields
  youtubeId?: string;
  isStreamOnly?: boolean;
}

// --- Responses ---
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}
