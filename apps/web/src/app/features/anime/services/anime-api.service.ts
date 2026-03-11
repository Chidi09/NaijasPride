import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

type AnimeSearchParams = {
  q?: string;
  page?: number;
  perPage?: number;
  sort?: string;
  genre?: string;
  season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
  seasonYear?: number;
};

@Injectable({ providedIn: 'root' })
export class AnimeApiService {
  private http = inject(HttpClient);

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
