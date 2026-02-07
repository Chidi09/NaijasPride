import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface WatchHistoryItem {
  id: string;
  progress: number;
  duration: number;
  progressPercentage: number;
  updatedAt: string;
  movie: {
    id: string;
    title: string;
    slug: string;
    thumbnailUrl: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class WatchApiService {
  private http = inject(HttpClient);

  saveProgress(movieId: string, progress: number, duration: number) {
    return this.http.post<{ status: string; message: string }>(
      '/api/watch/progress', 
      { movieId, progress, duration }
    );
  }

  getProgress(movieId: string) {
    return this.http.get<{ status: string; data: { progress: number; duration: number; progressPercentage: number } }>(
      `/api/watch/progress/${movieId}`
    );
  }

  getWatchHistory() {
    return this.http.get<{ status: string; data: WatchHistoryItem[] }>(
      '/api/watch/history'
    );
  }
}
