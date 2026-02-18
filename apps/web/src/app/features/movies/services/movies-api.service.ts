import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { 
  MovieSearchParams, 
  ApiResponse, 
  MovieSummary,
  Movie
} from '@naijaspride/types';

@Injectable({ providedIn: 'root' })
export class MoviesApiService {
  private http = inject(HttpClient);

  getMovies(params: MovieSearchParams) {
    // Convert generic params to HttpParams friendly object if needed, 
    // but HttpClient handles basic objects well.
    return this.http.get<ApiResponse<MovieSummary[]>>('/api/v1/movies', {
      params: params as any,
    });
  }

  getMovieBySlug(slug: string) {
    return this.http.get<ApiResponse<Movie>>(`/api/v1/movies/${slug}`);
  }

  updateMovie(id: string, data: Partial<Movie>) {
    return this.http.put<ApiResponse<Movie>>(`/api/v1/movies/${id}`, data);
  }

  deleteMovie(id: string) {
    return this.http.delete<ApiResponse<void>>(`/api/v1/movies/${id}`);
  }
}
