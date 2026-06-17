import { Injectable, inject } from "@angular/core";
import {
  injectQuery,
  injectMutation,
  QueryClient,
} from "@tanstack/angular-query-experimental";
import { ProfileApiService } from "./profile-api.service";
import { lastValueFrom } from "rxjs";

@Injectable({ providedIn: "root" })
export class ProfileQueryService {
  private api = inject(ProfileApiService);
  private queryClient = inject(QueryClient);

  getProfileQuery() {
    return injectQuery(() => ({
      queryKey: ["profile"],
      queryFn: () => lastValueFrom(this.api.getProfile()),
    }));
  }

  toggleWatchlistMutation() {
    return injectMutation(() => ({
      mutationFn: (movieId: string) =>
        lastValueFrom(this.api.toggleWatchlist(movieId)),
      onSuccess: (result) => {
        // Invalidate profile query to refresh watchlist
        this.queryClient.invalidateQueries({ queryKey: ["profile"] });
      },
      onError: (error) => {},
    }));
  }

  getSubscriptionQuery() {
    return injectQuery(() => ({
      queryKey: ["subscription"],
      queryFn: () => lastValueFrom(this.api.getSubscription()),
      staleTime: 60 * 1000, // 1 minute
      retry: (failureCount, error: unknown) => {
        // Don't retry on 401 — guest users will always get 401
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 2;
      },
    }));
  }

  invalidateSubscription() {
    return this.queryClient.invalidateQueries({ queryKey: ["subscription"] });
  }

  invalidateProfile() {
    return this.queryClient.invalidateQueries({ queryKey: ["profile"] });
  }
}
