import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AuthStateService } from '../../../../core/auth/auth-state.service';
import type { HighlightColor, HighlightEntry } from '../models/reader.models';

type ApiHighlight = {
  id: string;
  kind: 'epub' | 'pdf' | string;
  color: HighlightColor | string;
  cfiRange?: string | null;
  excerpt?: string | null;
  page?: number | null;
  rect?: any;
  createdAt: string;
  updatedAt: string;
};

const isColor = (value: any): value is HighlightColor =>
  value === 'yellow' || value === 'green' || value === 'blue' || value === 'pink';

@Injectable({
  providedIn: 'root',
})
export class ReaderHighlightsService {
  private http = inject(HttpClient);
  private authState = inject(AuthStateService);

  isAuthenticated(): boolean {
    return !!this.authState.getToken();
  }

  loadHighlights(slug: string) {
    if (!this.isAuthenticated()) {
      return of([] as HighlightEntry[]);
    }

    return this.http
      .get<{ status: string; data: ApiHighlight[] }>(
        `/api/v1/books/highlights/${encodeURIComponent(slug)}`
      )
      .pipe(
        map((response) => {
          const list = Array.isArray(response?.data) ? response.data : [];
          return list
            .map((h): HighlightEntry | null => {
              const createdAt = Date.parse(h.createdAt);
              const at = Number.isFinite(createdAt) ? createdAt : Date.now();
              const color = isColor(h.color) ? h.color : 'yellow';

              if (h.kind === 'epub') {
                const cfiRange = (h.cfiRange || '').trim();
                if (!cfiRange) return null;
                return {
                  id: String(h.id),
                  kind: 'epub',
                  cfiRange,
                  excerpt: String(h.excerpt || '').trim(),
                  color,
                  createdAt: at,
                };
              }

              if (h.kind === 'pdf') {
                const page = Math.max(1, Math.floor(Number(h.page) || 1));
                const rect = h.rect as any;
                const x = Number(rect?.x);
                const y = Number(rect?.y);
                const w = Number(rect?.w);
                const hh = Number(rect?.h);
                if (![x, y, w, hh].every((n) => Number.isFinite(n))) return null;
                return {
                  id: String(h.id),
                  kind: 'pdf',
                  page,
                  rect: { x, y, w, h: hh },
                  color,
                  createdAt: at,
                };
              }

              return null;
            })
            .filter(Boolean) as HighlightEntry[];
        }),
        catchError(() => of([] as HighlightEntry[]))
      );
  }

  createHighlight(slug: string, highlight: HighlightEntry) {
    if (!this.isAuthenticated()) {
      return of(null);
    }

    const body: any = {
      id: highlight.id,
      kind: highlight.kind,
      color: highlight.color,
      createdAt: highlight.createdAt,
    };

    if (highlight.kind === 'epub') {
      body.cfiRange = highlight.cfiRange;
      body.excerpt = highlight.excerpt;
    } else {
      body.page = highlight.page;
      body.rect = highlight.rect;
    }

    return this.http
      .post(`/api/v1/books/highlights/${encodeURIComponent(slug)}`, body)
      .pipe(catchError(() => of(null)));
  }

  deleteHighlight(slug: string, id: string) {
    if (!this.isAuthenticated()) {
      return of(null);
    }

    return this.http
      .delete(`/api/v1/books/highlights/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`)
      .pipe(catchError(() => of(null)));
  }

  clearHighlights(slug: string) {
    if (!this.isAuthenticated()) {
      return of(null);
    }

    return this.http
      .delete(`/api/v1/books/highlights/${encodeURIComponent(slug)}`)
      .pipe(catchError(() => of(null)));
  }
}
