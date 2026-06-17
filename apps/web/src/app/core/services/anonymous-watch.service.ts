import { Injectable, signal } from "@angular/core";
import { MovieSummary } from "@naijaspride/types";

export interface AnonymousWatchHistory {
  movieId: string;
  slug: string | null;
  title: string;
  thumbnailUrl?: string;
  progressPercentage: number;
  lastPosition: number;
  totalDuration: number;
  watchedAt: string;
  completed: boolean;
}

const STORAGE_KEY = "np_anonymous_watch_history";

/**
 * Service to manage watch history for non-authenticated users
 * Stores data in localStorage and migrates to Supabase on account creation
 */
@Injectable({
  providedIn: "root",
})
export class AnonymousWatchService {
  private watchHistory = signal<AnonymousWatchHistory[]>([]);

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Get all watch history for anonymous user
   */
  getHistory(): AnonymousWatchHistory[] {
    return this.watchHistory();
  }

  /**
   * Get watch progress for a specific movie
   */
  getProgress(movieId: string): AnonymousWatchHistory | undefined {
    return this.watchHistory().find((h) => h.movieId === movieId);
  }

  /**
   * Save or update watch progress
   */
  saveProgress(
    movie: MovieSummary,
    progressPercentage: number,
    lastPosition: number,
    totalDuration: number,
    completed = false,
  ): void {
    const history = this.watchHistory();
    const existingIndex = history.findIndex((h) => h.movieId === movie.id);

    const entry: AnonymousWatchHistory = {
      movieId: movie.id,
      slug: movie.slug ?? "",
      title: movie.title,
      thumbnailUrl: movie.thumbnailUrl ?? undefined,
      progressPercentage: Math.max(0, Math.min(100, progressPercentage)),
      lastPosition,
      totalDuration,
      watchedAt: new Date().toISOString(),
      completed,
    };

    if (existingIndex >= 0) {
      // Update existing entry
      history[existingIndex] = entry;
    } else {
      // Add new entry
      history.unshift(entry);
    }

    // Keep only last 100 entries to prevent storage bloat
    const trimmedHistory = history.slice(0, 100);
    this.watchHistory.set(trimmedHistory);
    this.saveToStorage();
  }

  /**
   * Mark a movie as completed
   */
  markCompleted(movieId: string): void {
    const history = this.watchHistory();
    const entry = history.find((h) => h.movieId === movieId);
    if (entry) {
      entry.completed = true;
      entry.progressPercentage = 100;
      this.watchHistory.set([...history]);
      this.saveToStorage();
    }
  }

  /**
   * Remove an entry from history
   */
  removeFromHistory(movieId: string): void {
    const history = this.watchHistory().filter((h) => h.movieId !== movieId);
    this.watchHistory.set(history);
    this.saveToStorage();
  }

  /**
   * Clear all anonymous watch history
   */
  clearHistory(): void {
    this.watchHistory.set([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Get all history as migration payload for when user creates account
   */
  getMigrationPayload(): AnonymousWatchHistory[] {
    return this.watchHistory();
  }

  /**
   * Clear local storage after successful migration
   */
  clearAfterMigration(): void {
    this.clearHistory();
  }

  /**
   * Check if user has any anonymous watch history
   */
  hasHistory(): boolean {
    return this.watchHistory().length > 0;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.watchHistory.set(parsed);
        }
      }
    } catch (error) {
      console.error("Error loading anonymous watch history:", error);
      this.watchHistory.set([]);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.watchHistory()));
    } catch (error) {
      console.error("Error saving anonymous watch history:", error);
      // If storage is full, remove oldest entries
      if (
        error instanceof DOMException &&
        error.name === "QuotaExceededError"
      ) {
        const trimmed = this.watchHistory().slice(0, 50);
        this.watchHistory.set(trimmed);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      }
    }
  }
}
