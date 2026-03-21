import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { tap } from "rxjs/operators";
import { ToastService } from "../../../core/services/toast.service";

export interface TvWatchProgressItem {
  showId: string;
  episodeId: string;
  progress: number;
  duration: number;
  updatedAt: string;
}

export interface TvWatchHistoryItem {
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
    posterUrl?: string | null;
    coverUrl?: string | null;
    backdropUrl?: string | null;
  };
}

@Injectable({ providedIn: "root" })
export class WatchApiService {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  // Throttle trust-layer toasts so they don't spam on every progress tick
  private lastSyncToast = 0;
  private readonly SYNC_TOAST_INTERVAL = 120_000; // 2 min between toasts

  saveProgress(movieId: string, progress: number, duration: number) {
    return this.http.post<{ status: string; message: string }>(
      "/api/v1/watch/progress",
      { movieId, progress, duration },
    ).pipe(
      tap(() => this.showSyncToast()),
    );
  }

  saveTvProgress(payload: {
    showId: string;
    episodeId: string;
    seasonNumber: number;
    episodeNumber: number;
    progress: number;
    duration: number;
  }) {
    return this.http.post<{ success: boolean; message: string }>(
      '/api/v1/tv-shows/progress',
      payload,
    );
  }

  getTvProgress(showId: string) {
    return this.http.get<{
      success: boolean;
      data: TvWatchProgressItem | null;
    }>(`/api/v1/tv-shows/progress/${showId}`);
  }

  getTvHistory(limit = 10) {
    return this.http.get<{
      success: boolean;
      data: TvWatchHistoryItem[];
    }>(`/api/v1/tv-shows/history?limit=${limit}`);
  }

  getProgress(movieId: string) {
    return this.http.get<{
      status: string;
      data: { progress: number; duration: number; progressPercentage: number };
    }>(`/api/v1/watch/progress/${movieId}`);
  }

  getWatchHistory(params?: { page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";

    return this.http.get<{
      status: string;
      data: WatchHistoryItem[];
      meta?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>(`/api/v1/watch/history${suffix}`);
  }

  private showSyncToast() {
    const now = Date.now();
    if (now - this.lastSyncToast > this.SYNC_TOAST_INTERVAL) {
      this.lastSyncToast = now;
      this.toast.info('Progress synced');
    }
  }
}
