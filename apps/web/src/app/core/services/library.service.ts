/**
 * LibraryService
 *
 * Handles:
 *  - Book favorites (add / remove / list / check)
 *  - Manga new-chapter watch subscriptions (subscribe / unsubscribe / mark-seen)
 *
 * All methods are thin HTTP wrappers; state management lives in components
 * or TanStack Query. Signals are used for simple reactive local state.
 */

import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface BookFavorite {
  id: string;
  bookId: string;
  addedAt: string;
  book: {
    id: string;
    title: string;
    slug: string;
    author: string;
    coverUrl: string | null;
    format: string;
    pageCount: number | null;
    genre: string[];
    year: number;
    status: string;
  };
}

export interface MangaChapterWatch {
  id: string;
  mangaId: string;
  mangaTitle: string;
  mangaCoverUrl: string | null;
  lastSeenChapterId: string | null;
  lastSeenAt: string | null;
}

const API = '/api/v1/library';

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private http = inject(HttpClient);

  // Reactive sets for fast optimistic UI
  private _favBookIds = signal<Set<string>>(new Set());
  private _watchedMangaIds = signal<Set<string>>(new Set());

  readonly favBookIds = this._favBookIds.asReadonly();
  readonly watchedMangaIds = this._watchedMangaIds.asReadonly();

  // ── Book Favorites ────────────────────────────────────────────────────────

  async loadBookFavorites(): Promise<BookFavorite[]> {
    const res = await firstValueFrom(
      this.http.get<{ status: string; data: BookFavorite[] }>(`${API}/books/favorites`)
    );
    const ids = new Set(res.data.map(f => f.bookId));
    this._favBookIds.set(ids);
    return res.data;
  }

  isFavoriteBook(bookId: string): boolean {
    return this._favBookIds().has(bookId);
  }

  async toggleBookFavorite(bookId: string): Promise<boolean> {
    const isFav = this.isFavoriteBook(bookId);
    // Optimistic update
    const next = new Set(this._favBookIds());
    if (isFav) next.delete(bookId); else next.add(bookId);
    this._favBookIds.set(next);

    try {
      if (isFav) {
        await firstValueFrom(this.http.delete(`${API}/books/favorites/${bookId}`));
      } else {
        await firstValueFrom(this.http.post(`${API}/books/favorites`, { bookId }));
      }
      return !isFav;
    } catch (err) {
      // Rollback on failure
      const rollback = new Set(this._favBookIds());
      if (isFav) rollback.add(bookId); else rollback.delete(bookId);
      this._favBookIds.set(rollback);
      throw err;
    }
  }

  async checkBookFavorite(bookId: string): Promise<boolean> {
    const res = await firstValueFrom(
      this.http.get<{ status: string; data: { favorited: boolean } }>(`${API}/books/favorites/${bookId}/check`)
    );
    const next = new Set(this._favBookIds());
    if (res.data.favorited) next.add(bookId); else next.delete(bookId);
    this._favBookIds.set(next);
    return res.data.favorited;
  }

  // ── Manga Chapter Watch ───────────────────────────────────────────────────

  async loadChapterWatches(): Promise<MangaChapterWatch[]> {
    const res = await firstValueFrom(
      this.http.get<{ status: string; data: MangaChapterWatch[] }>(`${API}/manga/chapter-watch`)
    );
    const ids = new Set(res.data.map(w => w.mangaId));
    this._watchedMangaIds.set(ids);
    return res.data;
  }

  isWatchingManga(mangaId: string): boolean {
    return this._watchedMangaIds().has(mangaId);
  }

  async watchManga(params: {
    mangaId: string;
    mangaTitle: string;
    mangaCoverUrl?: string;
    lastSeenChapterId?: string;
    lastSeenAt?: string;
  }): Promise<void> {
    const next = new Set(this._watchedMangaIds());
    next.add(params.mangaId);
    this._watchedMangaIds.set(next);

    try {
      await firstValueFrom(this.http.post(`${API}/manga/chapter-watch`, params));
    } catch (err) {
      const rollback = new Set(this._watchedMangaIds());
      rollback.delete(params.mangaId);
      this._watchedMangaIds.set(rollback);
      throw err;
    }
  }

  async unwatchManga(mangaId: string): Promise<void> {
    const next = new Set(this._watchedMangaIds());
    next.delete(mangaId);
    this._watchedMangaIds.set(next);

    try {
      await firstValueFrom(this.http.delete(`${API}/manga/chapter-watch/${encodeURIComponent(mangaId)}`));
    } catch (err) {
      const rollback = new Set(this._watchedMangaIds());
      rollback.add(mangaId);
      this._watchedMangaIds.set(rollback);
      throw err;
    }
  }

  async toggleMangaWatch(params: {
    mangaId: string;
    mangaTitle: string;
    mangaCoverUrl?: string;
    lastSeenChapterId?: string;
  }): Promise<boolean> {
    if (this.isWatchingManga(params.mangaId)) {
      await this.unwatchManga(params.mangaId);
      return false;
    } else {
      await this.watchManga(params);
      return true;
    }
  }

  async markChapterSeen(mangaId: string, lastSeenChapterId: string): Promise<void> {
    await firstValueFrom(
      this.http.patch(`${API}/manga/chapter-watch/mark-seen`, {
        mangaId,
        lastSeenChapterId,
        lastSeenAt: new Date().toISOString(),
      })
    );
  }

  // ── Library Summary ───────────────────────────────────────────────────────

  async getSummary() {
    const res = await firstValueFrom(
      this.http.get<{ status: string; data: {
        bookFavCount: number;
        mangaFavCount: number;
        offlineMangaCount: number;
        offlineBookCount: number;
        chapterWatchCount: number;
      }}>(`${API}/summary`)
    );
    return res.data;
  }
}
