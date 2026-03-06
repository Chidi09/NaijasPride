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

  private toHttpParams(params: MovieSearchParams): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        out[key] = value.join(',');
        continue;
      }
      out[key] = value as string | number | boolean;
    }

    return out;
  }

  getMovies(params: MovieSearchParams) {
    return this.http.get<ApiResponse<MovieSummary[]>>('/api/v1/movies', {
      params: this.toHttpParams(params),
    });
  }

  getMovieSuggestions(query: string, limit = 6) {
    return this.getMovies({
      q: query,
      page: 1,
      limit,
      sortBy: 'popular',
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
