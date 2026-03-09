import { ContentStatus, Genre } from '../enums';

export interface TvEpisode {
  id: string;
  episodeNumber: number;
  title: string;
  overview: string | null;
  durationMinutes: number | null;
  thumbnailUrl: string | null;
}

export interface TvSeason {
  id: string;
  seasonNumber: number;
  title: string | null;
  overview: string | null;
  posterUrl: string | null;
  episodes: TvEpisode[];
}

export interface TvShow {
  id: string;
  title: string;
  slug: string;
  overview: string | null;
  year: number;
  genre: Genre[];
  language: string;
  imdbId: string | null;
  tmdbId: number | null;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  trailerUrl: string | null;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
  seasons: TvSeason[];
}

export interface TvShowSummary {
  id: string;
  title: string;
  slug: string;
  year: number;
  genre: Genre[];
  thumbnailUrl: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  imdbId: string | null;
  tmdbId: number | null;
  canStream: boolean;
  seasonCount: number;
  episodeCount: number;
}
