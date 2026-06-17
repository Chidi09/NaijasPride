import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import {
  ApiResponse,
  TvShow,
  TvShowSearchParams,
  TvShowSummary,
} from "@naijaspride/types";

@Injectable({ providedIn: "root" })
export class TvShowsApiService {
  private http = inject(HttpClient);

  private toHttpParams(
    params: TvShowSearchParams,
  ): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        if (!value.length) continue;
        out[key] = value.join(",");
        continue;
      }
      out[key] = value as string | number | boolean;
    }
    return out;
  }

  getShows(params: TvShowSearchParams) {
    return this.http.get<ApiResponse<TvShowSummary[]>>("/api/v1/tv-shows", {
      params: this.toHttpParams(params),
    });
  }

  getShowBySlug(slug: string) {
    return this.http.get<ApiResponse<TvShow>>(`/api/v1/tv-shows/${slug}`);
  }
}
