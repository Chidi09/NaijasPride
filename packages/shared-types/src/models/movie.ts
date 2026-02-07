import { Quality, Genre, ContentStatus } from '../enums';

export interface MovieMetadata {
  director?: string;
  cast?: string[];
  country?: string;
  subtitles?: string[];
  trailerUrl?: string;
  nollywood?: boolean;
}

export interface Movie {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  year: number;
  genre: Genre[];
  language: string;
  quality: Quality[];
  durationMinutes: number | null;
  rating: number | null;
  imdbId: string | null;
  tmdbId: number | null;
  thumbnailUrl: string | null;
  coverUrl: string | null;
  fileUrls: Record<string, string>; // Key is Quality enum string
  fileSizes: Record<string, number>;
  
  // Streaming fields
  youtubeId: string | null;
  isStreamOnly: boolean;
  
  downloadCount: number;
  viewCount: number;
  status: ContentStatus;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  metadata: MovieMetadata;
}

export interface MovieSummary {
  id: string;
  title: string;
  slug: string;
  year: number;
  genre: Genre[];
  quality: Quality[];
  rating: number | null;
  thumbnailUrl: string | null;
  downloadCount: number;
  nollywood: boolean;
}
