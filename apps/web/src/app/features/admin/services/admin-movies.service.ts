import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { injectMutation, injectQueryClient } from '@tanstack/angular-query-experimental';
import { CreateMovieRequest, ApiResponse, Movie, MovieSearchParams, MovieSummary } from '@naijaspride/types';
import { lastValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminMoviesService {
  private http = inject(HttpClient);
  private queryClient = injectQueryClient();

  createMovieMutation() {
    return injectMutation(() => ({
      mutationFn: (data: CreateMovieRequest) => 
        lastValueFrom(this.http.post<ApiResponse<Movie>>('/api/v1/movies', data)),
      onSuccess: () => {
        // Invalidate public queries so new content shows up immediately
        this.queryClient.invalidateQueries({ queryKey: ['movies'] });
      },
    }));
  }

  getMovies(params: Partial<MovieSearchParams> = { page: 1, limit: 20 }) {
    return this.http.get<ApiResponse<MovieSummary[]>>('/api/v1/movies', {
      params: params as Record<string, string | number | boolean>,
    });
  }

  syncMetadataMutation() {
    return injectMutation(() => ({
      mutationFn: (movieId: string) =>
        lastValueFrom(this.http.post<ApiResponse<{ success: boolean; title?: string }>>(`/api/v1/movies/${movieId}/metadata/sync`, {})),
      onSuccess: () => {
        this.queryClient.invalidateQueries({ queryKey: ['movies'] });
      },
    }));
  }
}
