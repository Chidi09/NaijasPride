import { Injectable, inject, Signal } from "@angular/core";
import { injectQuery } from "@tanstack/angular-query-experimental";
import { MoviesApiService } from "./movies-api.service";
import { MovieSearchParams } from "@naijaspride/types";
import { lastValueFrom } from "rxjs";

@Injectable({ providedIn: "root" })
export class MoviesQueryService {
  private api = inject(MoviesApiService);

  getMoviesQuery(params: Signal<MovieSearchParams>) {
    return injectQuery(() => ({
      queryKey: ["movies", params()],
      queryFn: () => lastValueFrom(this.api.getMovies(params())),
      // Keep data fresh for 5 minutes, cache it for 30 minutes
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    }));
  }

  getMovieDetailQuery(slug: Signal<string>) {
    return injectQuery(() => ({
      queryKey: ["movie", slug()],
      queryFn: () => lastValueFrom(this.api.getMovieBySlug(slug())),
      enabled: !!slug(), // Only run if slug exists
      staleTime: 10 * 60 * 1000, // Keep detail data fresh for 10 mins
    }));
  }
}
