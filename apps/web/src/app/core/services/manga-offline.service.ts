/**
 * MangaOfflineService
 *
 * Kotatsu-style offline manga reading for the NaijasPride PWA.
 *
 * Each chapter is a sequence of page images. We:
 *  1. Fetch every page URL from the API  (/api/v1/books/manga/source/:src/pages-by-id)
 *  2. Fetch each image via fetch() — with CORS, no-referrer
 *  3. Store each image blob in Cache Storage under a virtual key:
 *       /offline/manga/<chapterId>/page/<index>
 *  4. Persist download state (status, progress, pageCount) in IndexedDB
 *  5. Record the save on the server: POST /api/v1/library/manga/offline
 *
 * The Service Worker intercepts requests to /offline/manga/* and serves
 * cached blobs — offline reading works with no internet.
 *
 * Download queue: serial by default (one chapter at a time) to avoid
 * saturating the source CDN. You can enqueue multiple chapters; they
 * download one after another.
 */

import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// ─── Constants ────────────────────────────────────────────────────────────────

const MANGA_CACHE     = 'np-manga-v1';
const MANGA_META_DB   = 'np_manga_offline_v1';
const MANGA_META_STORE = 'chapters';
const MANGA_URL_PREFIX = '/offline/manga/';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MangaDLStatus = 'idle' | 'queued' | 'downloading' | 'complete' | 'error';

export interface MangaChapterMeta {
  /** Composite key: chapterId (source entity ID) */
  id: string;
  mangaId: string;
  mangaTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: string;
  coverUrl?: string;
  status: MangaDLStatus;
  /** 0–100 */
  progress: number;
  pageCount: number;
  downloadedPages: number;
  fileSizeBytes: number;
  savedAt: number;
  error?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class MangaOfflineService {
  private http = inject(HttpClient);

  private _chapters = signal<Map<string, MangaChapterMeta>>(new Map());
  readonly chapters = computed(() => [...this._chapters().values()]);

  private _dbPromise: Promise<IDBDatabase> | null = null;
  private _downloadQueue: string[] = []; // chapterIds queued
  private _isProcessing = false;

  get isSupported(): boolean {
    return typeof caches !== 'undefined' && typeof indexedDB !== 'undefined';
  }

  constructor() {
    if (this.isSupported) this._loadFromDb();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  isAvailable(chapterId: string): boolean {
    return this._chapters().get(chapterId)?.status === 'complete';
  }

  getStatus(chapterId: string): MangaDLStatus {
    return this._chapters().get(chapterId)?.status ?? 'idle';
  }

  getProgress(chapterId: string): number {
    return this._chapters().get(chapterId)?.progress ?? 0;
  }

  /** Number of complete chapters for a given manga */
  downloadedChapterCount(mangaId: string): number {
    return this.chapters().filter(c => c.mangaId === mangaId && c.status === 'complete').length;
  }

  /** All complete chapters for a manga, sorted by chapter number */
  downloadedChapters(mangaId: string): MangaChapterMeta[] {
    return this.chapters()
      .filter(c => c.mangaId === mangaId && c.status === 'complete')
      .sort((a, b) => parseFloat(a.chapterNumber) - parseFloat(b.chapterNumber));
  }

  /**
   * Get the offline URL for a page (to use as <img src>).
   * Returns null if not cached.
   */
  async getPageUrl(chapterId: string, pageIndex: number): Promise<string | null> {
    if (!this.isSupported) return null;
    try {
      const cache = await caches.open(MANGA_CACHE);
      const key = this._pageKey(chapterId, pageIndex);
      const match = await cache.match(key);
      if (!match) return null;
      return URL.createObjectURL(await match.blob());
    } catch { return null; }
  }

  /**
   * Get all offline page URLs for a chapter.
   * Returns an array of blob: URLs (or null slots for missing pages).
   */
  async getAllPageUrls(chapterId: string): Promise<(string | null)[]> {
    const meta = this._chapters().get(chapterId);
    if (!meta || meta.status !== 'complete') return [];
    const results: (string | null)[] = [];
    for (let i = 0; i < meta.pageCount; i++) {
      results.push(await this.getPageUrl(chapterId, i));
    }
    return results;
  }

  /**
   * Queue a chapter for download.
   * pageUrls: the page image URLs from the API response.
   */
  enqueue(params: {
    mangaId: string;
    mangaTitle: string;
    chapterId: string;
    chapterTitle: string;
    chapterNumber: string;
    coverUrl?: string;
    pageUrls: string[];
  }) {
    const { chapterId } = params;
    const existing = this._chapters().get(chapterId);
    if (existing?.status === 'complete' || existing?.status === 'downloading' || existing?.status === 'queued') return;

    const meta: MangaChapterMeta = {
      id: chapterId,
      mangaId: params.mangaId,
      mangaTitle: params.mangaTitle,
      chapterId,
      chapterTitle: params.chapterTitle,
      chapterNumber: params.chapterNumber,
      coverUrl: params.coverUrl,
      status: 'queued',
      progress: 0,
      pageCount: params.pageUrls.length,
      downloadedPages: 0,
      fileSizeBytes: 0,
      savedAt: Date.now(),
    };
    this._update(meta);

    // Store page URLs temporarily in memory for the queue processor
    this._pageUrlsCache.set(chapterId, params.pageUrls);
    this._downloadQueue.push(chapterId);
    this._processQueue();
  }

  /** Remove a downloaded chapter */
  async remove(chapterId: string): Promise<void> {
    const meta = this._chapters().get(chapterId);
    const pageCount = meta?.pageCount ?? 0;

    try {
      const cache = await caches.open(MANGA_CACHE);
      for (let i = 0; i < pageCount; i++) {
        await cache.delete(this._pageKey(chapterId, i));
      }
    } catch { /* ignore */ }

    const db = await this._openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(MANGA_META_STORE, 'readwrite');
      tx.objectStore(MANGA_META_STORE).delete(chapterId);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    const map = new Map(this._chapters());
    map.delete(chapterId);
    this._chapters.set(map);

    firstValueFrom(this.http.delete('/api/v1/library/manga/offline', { body: { chapterId } }))
      .catch(console.error);
  }

  /** Remove all downloaded chapters for a manga */
  async removeAllForManga(mangaId: string): Promise<void> {
    const chapters = this.downloadedChapters(mangaId);
    for (const ch of chapters) {
      await this.remove(ch.chapterId);
    }
  }

  // ── Internal page URL cache (transient, not persisted) ─────────────────────

  private _pageUrlsCache = new Map<string, string[]>();

  // ── Download queue processor ─────────────────────────────────────────────────

  private async _processQueue() {
    if (this._isProcessing || this._downloadQueue.length === 0) return;
    this._isProcessing = true;

    while (this._downloadQueue.length > 0) {
      const chapterId = this._downloadQueue.shift()!;
      const pageUrls = this._pageUrlsCache.get(chapterId);
      this._pageUrlsCache.delete(chapterId);

      if (!pageUrls) continue;

      const meta = this._chapters().get(chapterId);
      if (!meta || meta.status === 'complete') continue;

      await this._downloadChapter(chapterId, pageUrls, meta);
    }

    this._isProcessing = false;
  }

  private async _downloadChapter(chapterId: string, pageUrls: string[], meta: MangaChapterMeta) {
    this._update({ ...meta, status: 'downloading', progress: 0 });
    const cache = await caches.open(MANGA_CACHE);
    let totalBytes = 0;
    let downloaded = 0;

    try {
      for (let i = 0; i < pageUrls.length; i++) {
        const url = pageUrls[i];
        const response = await fetch(url, {
          mode: 'cors',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
        });

        if (!response.ok) throw new Error(`Page ${i}: HTTP ${response.status}`);

        const blob = await response.blob();
        totalBytes += blob.size;
        downloaded++;

        await cache.put(
          this._pageKey(chapterId, i),
          new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } }),
        );

        const progress = Math.round((downloaded / pageUrls.length) * 100);
        this._update({ ...meta, status: 'downloading', progress, downloadedPages: downloaded, fileSizeBytes: totalBytes });
      }

      const finalMeta: MangaChapterMeta = {
        ...meta,
        status: 'complete',
        progress: 100,
        pageCount: pageUrls.length,
        downloadedPages: pageUrls.length,
        fileSizeBytes: totalBytes,
        savedAt: Date.now(),
      };
      this._update(finalMeta);

      // Record on server
      firstValueFrom(this.http.post('/api/v1/library/manga/offline', {
        mangaId:     meta.mangaId,
        mangaTitle:  meta.mangaTitle,
        chapterId,
        chapterTitle: meta.chapterTitle,
        pageCount:   pageUrls.length,
        fileSizeBytes: totalBytes,
      })).catch(console.error);

    } catch (err) {
      this._update({
        ...meta,
        status: 'error',
        error: err instanceof Error ? err.message : 'Download failed',
      });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private _pageKey(chapterId: string, pageIndex: number): string {
    // URL-safe key stored in Cache Storage
    return `${MANGA_URL_PREFIX}${encodeURIComponent(chapterId)}/page/${pageIndex}`;
  }

  private _update(meta: MangaChapterMeta): void {
    const map = new Map(this._chapters());
    map.set(meta.id, { ...meta });
    this._chapters.set(map);
    this._persist(meta).catch(console.error);
  }

  private async _persist(meta: MangaChapterMeta): Promise<void> {
    const db = await this._openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(MANGA_META_STORE, 'readwrite');
      tx.objectStore(MANGA_META_STORE).put(meta);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  private async _loadFromDb() {
    try {
      const db = await this._openDb();
      const all = await new Promise<MangaChapterMeta[]>((res, rej) => {
        const tx = db.transaction(MANGA_META_STORE, 'readonly');
        const req = tx.objectStore(MANGA_META_STORE).getAll();
        req.onsuccess = () => res(req.result as MangaChapterMeta[]);
        req.onerror = () => rej(req.error);
      });
      const map = new Map<string, MangaChapterMeta>();
      for (const item of all) {
        // Mark interrupted downloads as error
        if (item.status === 'downloading' || item.status === 'queued') {
          item.status = 'error';
          item.error = 'Download was interrupted. Tap retry.';
        }
        map.set(item.id, item);
      }
      this._chapters.set(map);
    } catch (err) {
      console.warn('[MangaOffline] Failed to load IndexedDB:', err);
    }
  }

  private _openDb(): Promise<IDBDatabase> {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((res, rej) => {
      const req = indexedDB.open(MANGA_META_DB, 1);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MANGA_META_STORE)) {
          db.createObjectStore(MANGA_META_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => res((e.target as IDBOpenDBRequest).result);
      req.onerror = (e) => {
        this._dbPromise = null;
        rej((e.target as IDBOpenDBRequest).error);
      };
    });
    return this._dbPromise;
  }
}
