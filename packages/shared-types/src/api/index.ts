import { Genre, Quality } from "../enums";
import { MovieMetadata } from "../models/movie";

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
  sortBy?: "latest" | "popular" | "rating" | "title" | "trending" | "newest";
  nollywoodOnly?: boolean;
  isStreamOnly?: boolean;
  youtubeOnly?: boolean;
}

export interface TvShowSearchParams extends PaginationParams {
  q?: string;
  genre?: Genre[];
  year?: number;
  language?: string;
  sortBy?: "latest" | "popular" | "title" | "trending";
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
  code: string;
  message: string;
  errors?: { field: string; message: string }[];
}

// --- Admin Uploads ---
export interface AdminUploadUrlRequest {
  fileName: string;
  contentType: string;
}

export interface AdminUploadUrlResponse {
  uploadUrl: string;
  storageKey: string;
}

export interface AdminCreateMovieRequest {
  title: string;
  year: number;
  genre: string | string[];
  description?: string;
  duration?: number;
  thumbnailUrl?: string;
  storageKey: string;
  contentType: string;
  fileSize: number;
  imdbId?: string;
  tmdbId?: number;
  fetchMetadata?: boolean;
  isStreamOnly?: boolean;
  director?: string;
}

export interface AdminBulkUploadMovie {
  title: string;
  year: number;
  genre: string | string[];
  storageKey: string;
  contentType: string;
  fileSize: number;
  fetchMetadata?: boolean;
}

export interface AdminBulkUploadRequest {
  movies: AdminBulkUploadMovie[];
}

export interface AdminJobProgressResponse {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  message?: string;
  data?: unknown;
}

// --- Revenue ---
export interface AdminRevenueSummary {
  subscriptions: number;
  ads: number;
  total: number;
}

export interface AdminRevenueBreakdownItem {
  period: string;
  subscription: number;
  ads: number;
}

export interface AdminRecordAdRevenueRequest {
  date?: string;
  revenue: number;
  impressions?: number;
  clicks?: number;
}

export const isApiSuccess = <T>(
  res: ApiResponse<T> | ApiErrorResponse,
): res is ApiResponse<T> => res.success === true;

export const isApiError = (value: unknown): value is ApiErrorResponse =>
  typeof value === "object" &&
  value !== null &&
  "success" in value &&
  (value as { success: unknown }).success === false;
