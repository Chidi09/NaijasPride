import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import {
  injectMutation,
  injectQueryClient,
} from "@tanstack/angular-query-experimental";
import {
  CreateMovieRequest,
  ApiResponse,
  Movie,
  MovieSearchParams,
  MovieSummary,
  AdminUploadUrlRequest,
  AdminUploadUrlResponse,
  AdminCreateMovieRequest,
  AdminBulkUploadRequest,
  AdminJobProgressResponse,
  AdminRevenueSummary,
  AdminRevenueBreakdownItem,
  AdminRecordAdRevenueRequest,
} from "@naijaspride/types";
import { lastValueFrom } from "rxjs";

@Injectable({ providedIn: "root" })
export class AdminMoviesService {
  private http = inject(HttpClient);
  private queryClient = injectQueryClient();

  // Existing methods...
  createMovieMutation() {
    return injectMutation(() => ({
      mutationFn: (data: CreateMovieRequest) =>
        lastValueFrom(
          this.http.post<ApiResponse<Movie>>("/api/v1/movies", data),
        ),
      onSuccess: () => {
        this.queryClient.invalidateQueries({ queryKey: ["movies"] });
      },
    }));
  }

  // Admin Specific Upload Methods
  getUploadUrl(data: AdminUploadUrlRequest) {
    return this.http.post<ApiResponse<AdminUploadUrlResponse>>(
      "/api/v1/admin/movies/upload-url",
      data,
    );
  }

  adminCreateMovie(data: AdminCreateMovieRequest) {
    return this.http.post<ApiResponse<Movie>>(
      "/api/v1/admin/movies/create",
      data,
    );
  }

  bulkUpload(data: AdminBulkUploadRequest) {
    return this.http.post<ApiResponse<{ jobId: string }>>(
      "/api/v1/admin/movies/bulk-upload",
      data,
    );
  }

  getJobProgress(jobId: string) {
    return this.http.get<ApiResponse<AdminJobProgressResponse>>(
      `/api/v1/admin/movies/progress/${jobId}`,
    );
  }

  // Upload file to R2 using signed URL
  uploadToR2(url: string, file: File) {
    return this.http.put(url, file, {
      headers: { "Content-Type": file.type },
      reportProgress: true,
      observe: "events",
    });
  }

  // Revenue Methods
  getRevenueSummary() {
    return this.http.get<ApiResponse<AdminRevenueSummary>>(
      "/api/v1/admin/revenue/summary",
    );
  }

  getRevenueBreakdown(period: "weekly" | "monthly" | "yearly" = "monthly") {
    return this.http.get<ApiResponse<AdminRevenueBreakdownItem[]>>(
      "/api/v1/admin/revenue/breakdown",
      {
        params: { period },
      },
    );
  }

  recordAdRevenue(data: AdminRecordAdRevenueRequest) {
    return this.http.post<ApiResponse<unknown>>(
      "/api/v1/admin/revenue/ads/record",
      data,
    );
  }

  getMovies(params: Partial<MovieSearchParams> = { page: 1, limit: 20 }) {
    return this.http.get<ApiResponse<MovieSummary[]>>("/api/v1/movies", {
      params: params as Record<string, string | number | boolean>,
    });
  }

  syncMetadataMutation() {
    return injectMutation(() => ({
      mutationFn: (movieId: string) =>
        lastValueFrom(
          this.http.post<ApiResponse<{ success: boolean; title?: string }>>(
            `/api/v1/movies/${movieId}/metadata/sync`,
            {},
          ),
        ),
      onSuccess: () => {
        this.queryClient.invalidateQueries({ queryKey: ["movies"] });
      },
    }));
  }
}
