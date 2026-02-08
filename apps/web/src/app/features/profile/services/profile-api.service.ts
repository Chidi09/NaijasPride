import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Movie, PaginationMeta } from "@naijaspride/types";

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
  watchlistMeta?: PaginationMeta;
  downloadHistoryMeta?: PaginationMeta;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistResponse {
  added: boolean;
}

export interface SubscriptionData {
  subscriptionStatus: "active" | "inactive" | "cancelled" | "expired";
  subscriptionPlan: "free" | "basic" | "standard" | "premium";
  subscriptionExpiresAt: string | null;
  subscriptionStartedAt: string | null;
  isPremium: boolean;
  daysRemaining: number;
}

@Injectable({ providedIn: "root" })
export class ProfileApiService {
  private http = inject(HttpClient);

  getProfile(params?: {
    watchlistPage?: number;
    watchlistLimit?: number;
    downloadPage?: number;
    downloadLimit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.watchlistPage)
      query.set("watchlistPage", String(params.watchlistPage));
    if (params?.watchlistLimit)
      query.set("watchlistLimit", String(params.watchlistLimit));
    if (params?.downloadPage)
      query.set("downloadPage", String(params.downloadPage));
    if (params?.downloadLimit)
      query.set("downloadLimit", String(params.downloadLimit));
    const suffix = query.toString() ? `?${query.toString()}` : "";

    return this.http.get<{ status: string; data: UserProfile }>(
      `/api/v1/profile${suffix}`,
    );
  }

  toggleWatchlist(movieId: string) {
    return this.http.post<{
      status: string;
      data: WatchlistResponse;
      message: string;
    }>("/api/v1/profile/watchlist", { movieId });
  }

  getSubscription() {
    return this.http.get<{ status: string; data: SubscriptionData }>(
      "/api/v1/profile/subscription",
    );
  }
}
