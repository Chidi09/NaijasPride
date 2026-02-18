import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AuthStateService } from '../../../../core/auth/auth-state.service';

export interface ServerBookProgress {
  page: number;
  updatedAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class ReaderProgressService {
  private http = inject(HttpClient);
  private authState = inject(AuthStateService);

  isAuthenticated(): boolean {
    return !!this.authState.getToken();
  }

  loadProgress(slug: string) {
    if (!this.isAuthenticated()) {
      return of(null as ServerBookProgress | null);
    }

    return this.http
      .get<{ status: string; data: { page: number; updatedAt: string } | null }>(
        `/api/v1/books/progress/${encodeURIComponent(slug)}`
      )
      .pipe(
        map((response) => {
          if (!response?.data) return null;
          const updatedAt = Date.parse(response.data.updatedAt);
          return {
            page: response.data.page,
            updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
          } satisfies ServerBookProgress;
        }),
        catchError(() => of(null))
      );
  }

  saveProgress(slug: string, page: number) {
    if (!this.isAuthenticated()) {
      return of(null);
    }

    return this.http
      .post(`/api/v1/books/progress`, { slug, page })
      .pipe(catchError(() => of(null)));
  }
}
