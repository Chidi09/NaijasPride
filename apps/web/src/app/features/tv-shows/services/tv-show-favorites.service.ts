import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'np:tv-show-favorites';

@Injectable({ providedIn: 'root' })
export class TvShowFavoritesService {
  private favorites = signal<Set<string>>(this.load());

  isFavorite(showId: string): boolean {
    return this.favorites().has(showId);
  }

  toggle(showId: string): boolean {
    const next = new Set(this.favorites());
    if (next.has(showId)) {
      next.delete(showId);
    } else {
      next.add(showId);
    }
    this.favorites.set(next);
    this.persist(next);
    return next.has(showId);
  }

  private load(): Set<string> {
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set<string>();
      return new Set(parsed.filter((entry) => typeof entry === 'string'));
    } catch {
      return new Set<string>();
    }
  }

  private persist(values: Set<string>): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(values)));
    } catch {
      // ignore storage write failures
    }
  }
}
