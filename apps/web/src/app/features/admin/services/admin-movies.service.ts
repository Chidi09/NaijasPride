import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { injectMutation, injectQueryClient } from '@tanstack/angular-query-experimental';
import { CreateMovieRequest, ApiResponse, Movie } from '@naijaspride/types';
import { lastValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminMoviesService {
  private http = inject(HttpClient);
  private queryClient = injectQueryClient();

  createMovieMutation() {
    return injectMutation(() => ({
      mutationFn: (data: CreateMovieRequest) => 
        lastValueFrom(this.http.post<ApiResponse<Movie>>('/api/movies', data)),
      onSuccess: () => {
        // Invalidate public queries so new content shows up immediately
        this.queryClient.invalidateQueries({ queryKey: ['movies'] });
      },
    }));
  }
}
