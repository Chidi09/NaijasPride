import { Injectable, inject } from '@angular/core';
import { injectQuery, injectMutation, QueryClient } from '@tanstack/angular-query-experimental';
import { ProfileApiService } from './profile-api.service';
import { lastValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProfileQueryService {
  private api = inject(ProfileApiService);
  private queryClient = inject(QueryClient);

  getProfileQuery() {
    return injectQuery(() => ({
      queryKey: ['profile'],
      queryFn: () => lastValueFrom(this.api.getProfile()),
    }));
  }

  toggleWatchlistMutation() {
    return injectMutation(() => ({
      mutationFn: (movieId: string) => lastValueFrom(this.api.toggleWatchlist(movieId)),
      onSuccess: () => {
        // Invalidate profile query to refresh watchlist
        this.queryClient.invalidateQueries({ queryKey: ['profile'] });
      },
    }));
  }

  getSubscriptionQuery() {
    return injectQuery(() => ({
      queryKey: ['subscription'],
      queryFn: () => lastValueFrom(this.api.getSubscription()),
      staleTime: 60 * 1000, // 1 minute
    }));
  }
}
