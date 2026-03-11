import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { forkJoin } from 'rxjs';

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
    return this.http.get<{ success: boolean; data: any }>('/api/v1/anime/search', { params: query });
  }

  getAnime(id: number) {
    return this.http.get<{ success: boolean; data: any }>(`/api/v1/anime/${id}`);
  }

  getEpisodes(id: number, provider = 'auto') {
    return this.http.get<{ success: boolean; data: any }>(`/api/v1/anime/${id}/episodes`, {
      params: new HttpParams().set('provider', provider),
    });
  }

  getWatchSources(id: number, episodeNumber: number, provider = 'auto', server?: string) {
    let params = new HttpParams().set('provider', provider);
    if (server) {
      params = params.set('server', server);
    }
    return this.http.get<{ success: boolean; data: any }>(`/api/v1/anime/${id}/watch/${episodeNumber}`, {
      params,
    });
  }
}
