import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, shareReplay, tap } from 'rxjs';

export interface TopItem {
  id: string;
  title: string;
  imageUrl: string | null;
  count: number;
  minutes: number;
  subtitle?: string;
}

export interface GenreStat {
  name: string;
  count: number;
  percentage: number;
}

export interface StreakInfo {
  longestStreak: number;
  currentStreak: number;
  totalActiveDays: number;
}

export interface WrappedStats {
  userId: string;
  period: string;
  periodLabel: string;
  isAnnual: boolean;
  totalMinutes: number;
  totalMoviesWatched: number;
  totalMusicPlays: number;
  totalBooksRead: number;
  totalMangaChapters: number;
  totalHighlights: number;
  totalDownloads: number;
  topMovie: TopItem | null;
  topArtist: TopItem | null;
  topSong: TopItem | null;
  topBook: TopItem | null;
  topMangaSeries: TopItem | null;
  topGenres: GenreStat[];
  genrePersonality: string;
  streak: StreakInfo;
  funFact: string;
  milestoneLabel: string | null;
}

export interface CardUrls {
  hero: string;
  topMovie: string;
  topMusic: string;
  topBook: string;
  genres: string;
  summary: string;
}

export interface WrappedData {
  period: string;
  stats: WrappedStats;
  cardUrls: CardUrls;
}

export interface PublicWrappedData extends WrappedData {
  userName: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class WrappedService {
  private http = inject(HttpClient);

  // Cache for loaded wrapped data
  private _cache = new Map<string, Observable<WrappedData | null>>();

  getMyWrapped(period: string): Observable<WrappedData | null> {
    const cacheKey = `my-${period}`;
    
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey)!.pipe(
        catchError(() => of(null))
      );
    }

    const request$ = this.http.get<{ success: boolean; data: WrappedData }>(`/api/v1/wrapped/${period}`).pipe(
      map(response => response.success ? response.data : null),
      shareReplay(1),
      catchError(() => of(null))
    );

    this._cache.set(cacheKey, request$ as Observable<WrappedData | null>);
    return request$;
  }

  getAvailablePeriods(): Observable<string[]> {
    return this.http.get<{ success: boolean; data: string[] }>('/api/v1/wrapped/periods').pipe(
      map(response => response.success ? response.data : []),
      catchError(() => of([]))
    );
  }

  regenerateWrapped(period: string): Observable<WrappedData | null> {
    // Clear cache
    this._cache.delete(`my-${period}`);
    
    return this.http.post<{ success: boolean; data: WrappedData }>(`/api/v1/wrapped/${period}/generate`, {}).pipe(
      map(response => response.success ? response.data : null),
      tap(data => {
        if (data) {
          const request$ = of(data).pipe(shareReplay(1));
          this._cache.set(`my-${period}`, request$);
        }
      }),
      catchError(() => of(null))
    );
  }

  getPublicWrapped(userId: string, period: string): Observable<PublicWrappedData | null> {
    return this.http.get<{ success: boolean; data: PublicWrappedData }>(`/api/v1/wrapped/public/${userId}/${period}`).pipe(
      map(response => response.success ? response.data : null),
      catchError(() => of(null))
    );
  }

  clearCache(period?: string): void {
    if (period) {
      this._cache.delete(`my-${period}`);
    } else {
      this._cache.clear();
    }
  }
}

// Helper import for map operator
import { map } from 'rxjs/operators';
