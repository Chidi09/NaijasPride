import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import {
  BookSummary,
  MusicFeaturedSections,
  MovieSummary,
} from "@naijaspride/types";

export interface BookProgressResponse {
  status: string;
  data?: {
    page?: number;
  } | null;
}

export interface ContinueReadingItem {
  bookId: string;
  title: string;
  author: string | null;
  slug: string;
  coverUrl: string | null;
  page: number;
  pageCount: number | null;
  progressPercentage: number | null;
  updatedAt: string;
}

export interface ContinueTvItem {
  showId: string;
  title: string;
  slug: string;
  posterUrl: string | null;
  episodeId: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  progress: number;
  duration: number;
  progressPercentage: number;
  updatedAt: string;
}

export interface ContinueAnimeItem {
  id: string;
  anilistId: number;
  episodeNumber: number;
  title: string;
  imageUrl: string | null;
  progress: number;
  duration: number;
  updatedAt: string;
}

export interface TrendingAnimeItem {
  id: number;
  title?: { english?: string; romaji?: string; native?: string };
  coverImage?: { large?: string; medium?: string; extraLarge?: string };
  genres?: string[];
  averageScore?: number;
}

@Injectable({ providedIn: "root" })
export class HomeApiService {
  private http = inject(HttpClient);

  /** GET /api/v1/movies?page=1&limit=10&sortBy=popular&isStreamOnly=false */
  getDownloadMovies() {
    return this.http.get<{ success?: boolean; data?: MovieSummary[] }>(
      "/api/v1/movies",
      {
        params: {
          page: "1",
          limit: "10",
          sortBy: "popular",
          isStreamOnly: "false",
        },
      },
    );
  }

  /** GET /api/v1/anime/search?page=1&perPage=10&sort=TRENDING_DESC */
  getTrendingAnime() {
    return this.http.get<{
      success?: boolean;
      data?: { media?: TrendingAnimeItem[] };
    }>("/api/v1/anime/search", {
      params: { page: "1", perPage: "10", sort: "TRENDING_DESC" },
    });
  }

  /** GET /api/v1/movies?page=1&limit=6&sortBy=popular&isStreamOnly=true */
  getStreamMovies() {
    return this.http.get<{ success?: boolean; data?: MovieSummary[] }>(
      "/api/v1/movies",
      {
        params: {
          page: "1",
          limit: "6",
          sortBy: "popular",
          isStreamOnly: "true",
        },
      },
    );
  }

  /** GET /api/v1/books?page=1&limit=4 */
  getFeaturedBooks() {
    return this.http.get<{ success?: boolean; data?: BookSummary[] }>(
      "/api/v1/books",
      {
        params: { page: "1", limit: "4" },
      },
    );
  }

  /** GET /api/v1/music/featured */
  getMusicFeatured() {
    return this.http.get<{ success: boolean; data: MusicFeaturedSections }>(
      "/api/v1/music/featured",
    );
  }

  /** GET /api/v1/books/progress/recent?limit=10 */
  getContinueReading() {
    return this.http.get<{ status: string; data: ContinueReadingItem[] }>(
      "/api/v1/books/progress/recent",
      {
        params: { limit: "10" },
      },
    );
  }

  /** GET /api/v1/tv-shows/history?limit=10 */
  getContinueTv() {
    return this.http.get<{ success: boolean; data: ContinueTvItem[] }>(
      "/api/v1/tv-shows/history",
      {
        params: { limit: "10" },
      },
    );
  }

  /** GET /api/v1/anime/history?limit=10 */
  getContinueAnime() {
    return this.http.get<{ success: boolean; data: ContinueAnimeItem[] }>(
      "/api/v1/anime/history",
      {
        params: { limit: "10" },
      },
    );
  }

  /** GET /api/v1/books/progress/:slug */
  getBookProgress(slug: string) {
    return this.http.get<BookProgressResponse>(
      `/api/v1/books/progress/${encodeURIComponent(slug)}`,
    );
  }
}
