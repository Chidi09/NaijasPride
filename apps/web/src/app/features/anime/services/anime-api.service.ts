import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { forkJoin } from 'rxjs';

export type AnimeWatchProgress = {
  id: string;
  anilistId: number;
  episodeNumber: number;
  title: string;
  imageUrl: string | null;
  progress: number;
  duration: number;
  createdAt: string;
  updatedAt: string;
};

type AnilistTitle = {
  english?: string;
  romaji?: string;
  native?: string;
};

type AnilistCoverImage = {
  medium?: string;
  large?: string;
  extraLarge?: string;
};

type AnilistDate = {
  year?: number;
  month?: number;
  day?: number;
};

export type AnilistMedia = {
  id: number;
  title?: AnilistTitle;
  coverImage?: AnilistCoverImage;
  bannerImage?: string;
  description?: string;
  genres?: string[];
  averageScore?: number;
  status?: string;
  episodes?: number;
  startDate?: AnilistDate;
  endDate?: AnilistDate;
  [key: string]: unknown;
};

type AnilistSearchResult = {
  media?: AnilistMedia[];
  pageInfo?: { total?: number; currentPage?: number; lastPage?: number; hasNextPage?: boolean };
};

type AnimeEpisode = {
  id: string;
  number: number;
  title?: string;
  image?: string;
};

type AnimeEpisodesResponse = {
  episodes?: AnimeEpisode[];
  provider?: string;
  bridgeAvailable?: boolean;
};

type AnimeWatchSource = {
  url: string;
  quality?: string;
  isM3U8?: boolean;
  isEmbed?: boolean;
  referer?: string;
};

type AnimeWatchResponse = {
  animeId?: number;
  sources?: AnimeWatchSource[];
  headers?: Record<string, string>;
  subtitles?: Array<{ url?: string; lang?: string }>;
  download?: string | null;
};

type AnimeSearchParams = {
  q?: string;
  page?: number;
  perPage?: number;
  sort?: string;
  genre?: string;
  season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
  seasonYear?: number;
};

export type AnimeRailKey = 'trending' | 'newSeason' | 'popular' | 'topRated' | 'classics';

export type AnimeRailConfig = {
  key: AnimeRailKey;
  title: string;
  params: AnimeSearchParams;
};

@Injectable({ providedIn: 'root' })
export class AnimeApiService {
  private http = inject(HttpClient);

  private currentSeason(): 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL' {
    const month = new Date().getUTCMonth() + 1;
    if (month <= 3) return 'WINTER';
    if (month <= 6) return 'SPRING';
    if (month <= 9) return 'SUMMER';
    return 'FALL';
  }

  getDiscoveryRailConfigs(perPage = 16): AnimeRailConfig[] {
    const year = new Date().getUTCFullYear();
    return [
      {
        key: 'trending',
        title: 'Trending Now',
        params: { perPage, sort: 'TRENDING_DESC' },
      },
      {
        key: 'newSeason',
        title: 'New This Season',
        params: {
          perPage,
          season: this.currentSeason(),
          seasonYear: year,
          sort: 'POPULARITY_DESC',
        },
      },
      {
        key: 'popular',
        title: 'Most Popular',
        params: { perPage, sort: 'POPULARITY_DESC' },
      },
      {
        key: 'topRated',
        title: 'Top Rated',
        params: { perPage, sort: 'SCORE_DESC' },
      },
      {
        key: 'classics',
        title: 'Classics',
        params: {
          perPage,
          seasonYear: year - 8,
          sort: 'POPULARITY_DESC',
        },
      },
    ];
  }

  getDiscoveryRails(perPage = 16) {
    const rails = this.getDiscoveryRailConfigs(perPage);
    const requests = rails.reduce((acc, rail) => {
      acc[rail.key] = this.search(rail.params);
      return acc;
    }, {} as Record<AnimeRailKey, ReturnType<AnimeApiService['search']>>);

    return forkJoin(requests);
  }

  search(params: AnimeSearchParams = {}) {
    let query = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      query = query.set(key, String(value));
    }
    return this.http.get<{ success: boolean; data: AnilistSearchResult }>('/api/v1/anime/search', { params: query });
  }

  getAnime(id: number) {
    return this.http.get<{ success: boolean; data: AnilistMedia }>(`/api/v1/anime/${id}`);
  }

  getEpisodes(id: number, provider = 'auto') {
    return this.http.get<{ success: boolean; data: AnimeEpisodesResponse }>(`/api/v1/anime/${id}/episodes`, {
      params: new HttpParams().set('provider', provider),
    });
  }

  getWatchSources(id: number, episodeNumber: number, provider = 'auto', server?: string) {
    let params = new HttpParams().set('provider', provider);
    if (server) {
      params = params.set('server', server);
    }
    return this.http.get<{ success: boolean; data: AnimeWatchResponse }>(`/api/v1/anime/${id}/watch/${episodeNumber}`, {
      params,
    });
  }

  saveProgress(payload: {
    anilistId: number;
    episodeNumber: number;
    title: string;
    imageUrl?: string;
    progress: number;
    duration: number;
  }) {
    return this.http.post<{ success: boolean; message: string }>('/api/v1/anime/progress', payload);
  }

  getProgress(anilistId: number) {
    return this.http.get<{ success: boolean; data: AnimeWatchProgress[] }>(`/api/v1/anime/progress/${anilistId}`);
  }

  getHistory(limit = 10) {
    return this.http.get<{ success: boolean; data: AnimeWatchProgress[] }>(`/api/v1/anime/history?limit=${limit}`);
  }
}
