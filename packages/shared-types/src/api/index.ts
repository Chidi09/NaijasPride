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
  sortBy?: 'latest' | 'popular' | 'rating' | 'title';
  nollywoodOnly?: boolean;
}

export interface CreateMovieRequest {
  title: string;
  description?: string;
  year: number;
  genre: Genre[];
  quality: Quality[];
  language?: string;
  durationMinutes?: number;
  imdbId?: string;
  tmdbId?: number;
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
