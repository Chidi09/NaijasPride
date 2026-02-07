import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Movie } from '@naijaspride/types';

export interface DownloadHistoryItem {
  id: string;
  quality: string;
  timestamp: string;
  movie: Movie;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  watchlist: Movie[];
  downloadHistory: DownloadHistoryItem[];
  recommendations: Movie[];
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistResponse {
  added: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private http = inject(HttpClient);

  getProfile() {
    return this.http.get<{ status: string; data: UserProfile }>('/api/profile');
  }

  toggleWatchlist(movieId: string) {
    return this.http.post<{ status: string; data: WatchlistResponse; message: string }>('/api/profile/watchlist', { movieId });
  }
}
