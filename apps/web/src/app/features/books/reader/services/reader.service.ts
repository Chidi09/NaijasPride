import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import type { BookmarkEntry, HighlightEntry, ReaderSettings } from '../models/reader.models';
import { ReaderStorageService } from './reader-storage.service';
import { ReaderProgressService, type ServerBookProgress } from './reader-progress.service';
import { ReaderHighlightsService } from './reader-highlights.service';
import { MilestoneService } from '../../../../core/services/milestone.service';

@Injectable()
export class ReaderService {
  private storage = inject(ReaderStorageService);
  private progressApi = inject(ReaderProgressService);
  private highlightsApi = inject(ReaderHighlightsService);
  private milestones = inject(MilestoneService);
  private bookMilestoneTriggered = false;

  slug = signal<string | null>(null);
  settings = signal<ReaderSettings>(this.storage.loadSettings());
  bookmarks = signal<BookmarkEntry[]>([]);
  highlights = signal<HighlightEntry[]>([]);

  serverProgress = signal<ServerBookProgress | null>(null);
  serverProgressLoaded = signal(false);

  private progressSub: Subscription | null = null;
  private highlightsSub: Subscription | null = null;

  destroy(): void {
    this.progressSub?.unsubscribe();
    this.progressSub = null;
    this.highlightsSub?.unsubscribe();
    this.highlightsSub = null;
  }

  setSlug(slug: string | null): void {
    this.slug.set(slug);
    if (!slug) {
      this.bookmarks.set([]);
      this.highlights.set([]);
      this.serverProgress.set(null);
      this.serverProgressLoaded.set(false);
      this.progressSub?.unsubscribe();
      this.progressSub = null;

      this.highlightsSub?.unsubscribe();
      this.highlightsSub = null;
      return;
    }

    this.bookmarks.set(this.storage.loadBookmarks(slug));
    this.highlights.set(this.storage.loadHighlights(slug));
    this.loadServerProgress(slug);
    this.loadServerHighlights(slug);
  }

  patchSettings(patch: Partial<ReaderSettings>): void {
    const current = this.settings();
    const next: ReaderSettings = {
      ...current,
      ...patch,
    };

    this.settings.set(this.normalizeSettings(next));
    this.storage.saveSettings(this.settings());
  }

  addBookmark(cfi: string, label: string): void {
    const slug = this.slug();
    if (!slug) return;
    const entry: BookmarkEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      cfi,
      label,
      createdAt: Date.now(),
    };
    const updated = [entry, ...this.bookmarks()].slice(0, 200);
    this.bookmarks.set(updated);
    this.storage.saveBookmarks(slug, updated);
  }

  clearBookmarks(): void {
    const slug = this.slug();
    if (!slug) return;
    this.bookmarks.set([]);
    this.storage.saveBookmarks(slug, []);
  }

  addHighlight(entry: HighlightEntry): void {
    const slug = this.slug();
    if (!slug) return;
    const updated = [entry, ...this.highlights()].slice(0, 1000);
    this.highlights.set(updated);
    this.storage.saveHighlights(slug, updated);

    this.highlightsApi.createHighlight(slug, entry).subscribe();
  }

  removeHighlight(id: string): void {
    const slug = this.slug();
    if (!slug) return;
    const updated = this.highlights().filter((h) => h.id !== id);
    this.highlights.set(updated);
    this.storage.saveHighlights(slug, updated);

    this.highlightsApi.deleteHighlight(slug, id).subscribe();
  }

  clearHighlights(): void {
    const slug = this.slug();
    if (!slug) return;
    this.highlights.set([]);
    this.storage.saveHighlights(slug, []);

    this.highlightsApi.clearHighlights(slug).subscribe();
  }

  private loadServerHighlights(slug: string): void {
    if (!this.highlightsApi.isAuthenticated()) {
      return;
    }

    this.highlightsSub?.unsubscribe();
    this.highlightsSub = this.highlightsApi.loadHighlights(slug).subscribe((serverList) => {
      const localList = this.highlights();

      const merged = this.mergeHighlights(localList, serverList);
      this.highlights.set(merged);
      this.storage.saveHighlights(slug, merged);

      const serverIds = new Set(serverList.map((h) => h.id));
      const toPush = localList.filter((h) => !serverIds.has(h.id)).slice(0, 50);
      for (const h of toPush) {
        this.highlightsApi.createHighlight(slug, h).subscribe();
      }
    });
  }

  private mergeHighlights(localList: HighlightEntry[], serverList: HighlightEntry[]): HighlightEntry[] {
    const map = new Map<string, HighlightEntry>();

    for (const h of localList) {
      map.set(h.id, h);
    }
    for (const h of serverList) {
      map.set(h.id, h);
    }

    return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  loadServerProgress(slug: string): void {
    this.serverProgressLoaded.set(false);
    this.progressSub?.unsubscribe();
    this.progressSub = this.progressApi.loadProgress(slug).subscribe((value) => {
      this.serverProgress.set(value);
      this.serverProgressLoaded.set(true);
    });
  }

  saveServerProgress(page: number): void {
    const slug = this.slug();
    if (!slug) return;

    // Milestone: first book opened
    if (!this.bookMilestoneTriggered && page > 1) {
      this.bookMilestoneTriggered = true;
      this.milestones.checkFirstBook();
    }

    this.progressApi.saveProgress(slug, page).subscribe();
  }

  private normalizeSettings(value: ReaderSettings): ReaderSettings {
    const fontSize = Number(value.fontSize);
    const lineHeight = Number(value.lineHeight);
    const autoScrollSpeed = Number(value.autoScrollSpeed);
    const pdfZoom = Number(value.pdfZoom);
    const ttsRate = Number(value.ttsRate);

    return {
      ...value,
      fontSize: Number.isFinite(fontSize) ? Math.max(80, Math.min(180, Math.round(fontSize))) : 110,
      lineHeight: Number.isFinite(lineHeight)
        ? Math.max(1.2, Math.min(2.2, Math.round(lineHeight * 10) / 10))
        : 1.6,
      autoScrollSpeed: Number.isFinite(autoScrollSpeed)
        ? Math.max(4, Math.min(80, Math.round(autoScrollSpeed)))
        : 18,
      pdfZoom: Number.isFinite(pdfZoom) ? Math.max(0.6, Math.min(2.6, Math.round(pdfZoom * 10) / 10)) : 1.15,
      highlightColor:
        value.highlightColor === 'yellow' ||
        value.highlightColor === 'green' ||
        value.highlightColor === 'blue' ||
        value.highlightColor === 'pink'
          ? value.highlightColor
          : 'yellow',
      ttsRate: Number.isFinite(ttsRate) ? Math.max(0.6, Math.min(1.6, Math.round(ttsRate * 10) / 10)) : 1.0,
      ttsVoiceUri: typeof value.ttsVoiceUri === 'string' ? value.ttsVoiceUri : null,
    };
  }
}
