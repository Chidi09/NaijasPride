import { Injectable, Signal, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { TvShowSearchParams } from '@naijaspride/types';
import { TvShowsApiService } from './tv-shows-api.service';

@Injectable({ providedIn: 'root' })
export class TvShowsQueryService {
  private api = inject(TvShowsApiService);

  getShowsQuery(params: Signal<TvShowSearchParams>) {
    return injectQuery(() => ({
      queryKey: ['tv-shows', params()],
      queryFn: () => lastValueFrom(this.api.getShows(params())),
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    }));
  }

  getShowDetailQuery(slug: Signal<string>) {
    return injectQuery(() => ({
      queryKey: ['tv-show', slug()],
      queryFn: () => lastValueFrom(this.api.getShowBySlug(slug())),
      enabled: !!slug(),
      staleTime: 10 * 60 * 1000,
    }));
  }
}
