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
      onSuccess: (result) => {
        console.log('Watchlist toggle success:', result);
        // Invalidate profile query to refresh watchlist
        this.queryClient.invalidateQueries({ queryKey: ['profile'] });
      },
      onError: (error) => {
        console.error('Watchlist toggle error:', error);
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
