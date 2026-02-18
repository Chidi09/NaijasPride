import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MusicVideoSummary, MusicVideo, MusicArtistPage, MusicFeaturedSections } from '@naijaspride/types';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface SearchResponse {
  success: boolean;
  videos: MusicVideoSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchParams {
  q?: string;
  genre?: string;
  region?: string;
  artist?: string;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class MusicApiService {
  private http = inject(HttpClient);

  getFeatured(): Observable<ApiResponse<MusicFeaturedSections>> {
    return this.http.get<ApiResponse<MusicFeaturedSections>>('/api/v1/music/featured');
  }

  search(params: SearchParams): Observable<SearchResponse> {
    const cleanParams: Record<string, string> = {};
    if (params.q) cleanParams['q'] = params.q;
    if (params.genre) cleanParams['genre'] = params.genre;
    if (params.region) cleanParams['region'] = params.region;
    if (params.artist) cleanParams['artist'] = params.artist;
    if (params.page) cleanParams['page'] = String(params.page);
    if (params.limit) cleanParams['limit'] = String(params.limit);

    return this.http.get<SearchResponse>('/api/v1/music', { params: cleanParams });
  }

  getBySlug(slug: string): Observable<ApiResponse<MusicVideo>> {
    return this.http.get<ApiResponse<MusicVideo>>(`/api/v1/music/${slug}`);
  }

  getRelated(slug: string, limit = 8): Observable<ApiResponse<MusicVideoSummary[]>> {
    return this.http.get<ApiResponse<MusicVideoSummary[]>>(`/api/v1/music/${slug}/related`, {
      params: { limit: String(limit) },
    });
  }

  getArtist(slug: string): Observable<ApiResponse<MusicArtistPage>> {
    return this.http.get<ApiResponse<MusicArtistPage>>(`/api/v1/music/artist/${slug}`);
  }

  getPlaylist(id: string): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`/api/v1/music/playlist/${id}`);
  }

  incrementPlay(id: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`/api/v1/music/${id}/play`, {});
  }

  toggleLike(id: string): Observable<ApiResponse<{ liked: boolean; likeCount: number }>> {
    return this.http.post<ApiResponse<{ liked: boolean; likeCount: number }>>(`/api/v1/music/${id}/like`, {});
  }

  getMyPlaylists(): Observable<ApiResponse<any[]>> {
    return this.http.get<ApiResponse<any[]>>('/api/v1/music/playlists/mine');
  }

  createPlaylist(title: string, description?: string, isPublic = false): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>('/api/v1/music/playlists', { title, description, isPublic });
  }

  addToPlaylist(playlistId: string, musicId: string): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`/api/v1/music/playlists/${playlistId}/items`, { musicId });
  }
}
