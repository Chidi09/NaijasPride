/**
 * MangaOfflineService
 *
 * Kotatsu-style offline manga reader with persisted serial queue.
 *
 * Enhancements:
 * - Queue and page URLs persisted in IndexedDB (survives refresh)
 * - Resume from partially downloaded pages already in Cache Storage
 * - Retry failed page fetches before marking chapter as error
 * - Failure reporting endpoint for notifications/telemetry
 */

import { Injectable, computed, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";

const MANGA_CACHE = "np-manga-v1";
const MANGA_META_DB = "np_manga_offline_v1";
const MANGA_META_STORE = "chapters";
const MANGA_QUEUE_STORE = "queue";
const MANGA_URL_PREFIX = "/offline/manga/";

const PAGE_FETCH_ATTEMPTS = 3;

export type MangaDLStatus =
  | "idle"
  | "queued"
  | "downloading"
  | "complete"
  | "error";

export interface MangaChapterMeta {
  id: string;
  mangaId: string;
  mangaTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: string;
  coverUrl?: string;
  status: MangaDLStatus;
  progress: number;
  pageCount: number;
  downloadedPages: number;
  fileSizeBytes: number;
  savedAt: number;
  retryCount: number;
  error?: string;
}

type QueueEntry = {
  chapterId: string;
  pageUrls: string[];
  updatedAt: number;
};

@Injectable({ providedIn: "root" })
export class MangaOfflineService {
  private http = inject(HttpClient);

  private _chapters = signal<Map<string, MangaChapterMeta>>(new Map());
  readonly chapters = computed(() => [...this._chapters().values()]);

  private _dbPromise: Promise<IDBDatabase> | null = null;
  private _downloadQueue: string[] = [];
  private _queueEntries = new Map<string, string[]>();
  private _isProcessing = false;

  get isSupported(): boolean {
    return typeof caches !== "undefined" && typeof indexedDB !== "undefined";
  }

  constructor() {
    if (this.isSupported) {
      this._loadFromDb()
        .then(() => this._restoreQueue())
        .catch((err) => console.warn("[MangaOffline] Init failed:", err));
    }
  }

  isAvailable(chapterId: string): boolean {
    return this._chapters().get(chapterId)?.status === "complete";
  }

  getStatus(chapterId: string): MangaDLStatus {
    return this._chapters().get(chapterId)?.status ?? "idle";
  }

  getProgress(chapterId: string): number {
    return this._chapters().get(chapterId)?.progress ?? 0;
  }

  downloadedChapterCount(mangaId: string): number {
    return this.chapters().filter(
      (c) => c.mangaId === mangaId && c.status === "complete",
    ).length;
  }

  downloadedChapters(mangaId: string): MangaChapterMeta[] {
    return this.chapters()
      .filter((c) => c.mangaId === mangaId && c.status === "complete")
      .sort(
        (a, b) => parseFloat(a.chapterNumber) - parseFloat(b.chapterNumber),
      );
  }

  async getPageUrl(
    chapterId: string,
    pageIndex: number,
  ): Promise<string | null> {
    if (!this.isSupported) return null;
    try {
      const cache = await caches.open(MANGA_CACHE);
      const key = this._pageKey(chapterId, pageIndex);
      const match = await cache.match(key);
      return match ? key : null;
    } catch {
      return null;
    }
  }

  async getAllPageUrls(chapterId: string): Promise<(string | null)[]> {
    const meta = this._chapters().get(chapterId);
    if (!meta || meta.status !== "complete") return [];
    const results: (string | null)[] = [];
    const cache = await caches.open(MANGA_CACHE);

    for (let i = 0; i < meta.pageCount; i++) {
      const key = this._pageKey(chapterId, i);
      const match = await cache.match(key);
      results.push(match ? key : null);
    }

    return results;
  }

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
    if (
      existing?.status === "complete" ||
      existing?.status === "downloading" ||
      existing?.status === "queued"
    )
      return;

    const meta: MangaChapterMeta = {
      id: chapterId,
      mangaId: params.mangaId,
      mangaTitle: params.mangaTitle,
      chapterId,
      chapterTitle: params.chapterTitle,
      chapterNumber: params.chapterNumber,
      coverUrl: params.coverUrl,
      status: "queued",
      progress: 0,
      pageCount: params.pageUrls.length,
      downloadedPages: 0,
      fileSizeBytes: 0,
      savedAt: Date.now(),
      retryCount: existing?.retryCount ?? 0,
      error: undefined,
    };

    this._update(meta);
    this._queueEntries.set(chapterId, [...params.pageUrls]);
    void this._persistQueueEntry({
      chapterId,
      pageUrls: params.pageUrls,
      updatedAt: Date.now(),
    });

    if (!this._downloadQueue.includes(chapterId)) {
      this._downloadQueue.push(chapterId);
    }
    void this._processQueue();
  }

  async remove(chapterId: string): Promise<void> {
    const meta = this._chapters().get(chapterId);
    const pageCount = meta?.pageCount ?? 0;

    this._downloadQueue = this._downloadQueue.filter((id) => id !== chapterId);
    this._queueEntries.delete(chapterId);

    try {
      const cache = await caches.open(MANGA_CACHE);
      for (let i = 0; i < pageCount; i++) {
        await cache.delete(this._pageKey(chapterId, i));
      }
    } catch {
      // ignore cache remove failures
    }

    const db = await this._openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(
        [MANGA_META_STORE, MANGA_QUEUE_STORE],
        "readwrite",
      );
      tx.objectStore(MANGA_META_STORE).delete(chapterId);
      tx.objectStore(MANGA_QUEUE_STORE).delete(chapterId);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    const map = new Map(this._chapters());
    map.delete(chapterId);
    this._chapters.set(map);

    firstValueFrom(
      this.http.delete("/api/v1/library/manga/offline", {
        body: { chapterId },
      }),
    ).catch(() => {});
  }

  async removeAllForManga(mangaId: string): Promise<void> {
    const chapters = this.downloadedChapters(mangaId);
    for (const ch of chapters) {
      await this.remove(ch.chapterId);
    }
  }

  private _restoreQueue() {
    const map = new Map(this._chapters());
    for (const [chapterId, meta] of map.entries()) {
      if (meta.status === "queued" || meta.status === "downloading") {
        if (this._queueEntries.has(chapterId)) {
          map.set(chapterId, {
            ...meta,
            status: "queued",
            error: undefined,
          });
          if (!this._downloadQueue.includes(chapterId)) {
            this._downloadQueue.push(chapterId);
          }
        } else {
          map.set(chapterId, {
            ...meta,
            status: "error",
            error: "Download was interrupted. Tap retry.",
          });
        }
      }
    }

    this._chapters.set(map);
    if (this._downloadQueue.length > 0) {
      void this._processQueue();
    }
  }

  private async _processQueue() {
    if (this._isProcessing || this._downloadQueue.length === 0) return;
    this._isProcessing = true;

    try {
      while (this._downloadQueue.length > 0) {
        const chapterId = this._downloadQueue.shift();
        if (!chapterId) continue;

        const pageUrls =
          this._queueEntries.get(chapterId) ||
          (await this._loadQueueEntry(chapterId));
        if (!pageUrls || pageUrls.length === 0) {
          const meta = this._chapters().get(chapterId);
          if (meta) {
            this._update({
              ...meta,
              status: "error",
              error: "Queued chapter data missing. Retry download.",
            });
          }
          continue;
        }

        this._queueEntries.set(chapterId, pageUrls);
        const meta = this._chapters().get(chapterId);
        if (!meta || meta.status === "complete") {
          await this._deleteQueueEntry(chapterId);
          continue;
        }

        await this._downloadChapter(chapterId, pageUrls, meta);
      }
    } finally {
      this._isProcessing = false;
    }
  }

  private async _downloadChapter(
    chapterId: string,
    pageUrls: string[],
    meta: MangaChapterMeta,
  ) {
    const cache = await caches.open(MANGA_CACHE);

    let downloaded = 0;
    let totalBytes = 0;

    // Resume support: count pages already cached.
    for (let i = 0; i < pageUrls.length; i++) {
      const existing = await cache.match(this._pageKey(chapterId, i));
      if (!existing) continue;
      downloaded += 1;
      try {
        totalBytes += (await existing.blob()).size;
      } catch {
        // ignore blob size errors
      }
    }

    this._update({
      ...meta,
      status: "downloading",
      downloadedPages: downloaded,
      fileSizeBytes: totalBytes,
      progress: Math.round((downloaded / Math.max(1, pageUrls.length)) * 100),
      error: undefined,
    });

    try {
      for (let i = 0; i < pageUrls.length; i++) {
        const pageKey = this._pageKey(chapterId, i);
        const existing = await cache.match(pageKey);
        if (existing) continue;

        const response = await this._fetchPageWithRetry(
          pageUrls[i],
          PAGE_FETCH_ATTEMPTS,
        );
        if (!response.ok) throw new Error(`Page ${i}: HTTP ${response.status}`);

        const blob = await response.blob();
        totalBytes += blob.size;
        downloaded += 1;

        await cache.put(
          pageKey,
          new Response(blob, {
            headers: { "Content-Type": blob.type || "image/jpeg" },
          }),
        );

        const progress = Math.round((downloaded / pageUrls.length) * 100);
        this._update({
          ...meta,
          status: "downloading",
          progress,
          downloadedPages: downloaded,
          fileSizeBytes: totalBytes,
          pageCount: pageUrls.length,
          retryCount: meta.retryCount,
        });
      }

      const done: MangaChapterMeta = {
        ...meta,
        status: "complete",
        progress: 100,
        pageCount: pageUrls.length,
        downloadedPages: pageUrls.length,
        fileSizeBytes: totalBytes,
        savedAt: Date.now(),
        retryCount: 0,
        error: undefined,
      };
      this._update(done);

      await this._deleteQueueEntry(chapterId);
      this._queueEntries.delete(chapterId);

      firstValueFrom(
        this.http.post("/api/v1/library/manga/offline", {
          mangaId: meta.mangaId,
          mangaTitle: meta.mangaTitle,
          chapterId,
          chapterTitle: meta.chapterTitle,
          pageCount: pageUrls.length,
          fileSizeBytes: totalBytes,
        }),
      ).catch(() => {});
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Download failed";
      this._update({
        ...meta,
        status: "error",
        error: reason,
        downloadedPages: downloaded,
        fileSizeBytes: totalBytes,
        progress: Math.round((downloaded / Math.max(1, pageUrls.length)) * 100),
        retryCount: (meta.retryCount || 0) + 1,
      });

      firstValueFrom(
        this.http.post("/api/v1/library/manga/offline/failure", {
          mangaId: meta.mangaId,
          mangaTitle: meta.mangaTitle,
          chapterId,
          reason,
        }),
      ).catch(() => {});
    }
  }

  private async _fetchPageWithRetry(
    url: string,
    attempts: number,
  ): Promise<Response> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const res = await fetch(url, {
          mode: "cors",
          referrerPolicy: "no-referrer",
          cache: "no-store",
        });

        if (res.ok) return res;

        // Retry only 5xx/429 classes.
        if (res.status < 500 && res.status !== 429) {
          return res;
        }

        lastError = new Error(`HTTP ${res.status}`);
      } catch (error) {
        lastError = error;
      }

      if (attempt < attempts) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, 250 * attempt),
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Page download failed");
  }

  private _pageKey(chapterId: string, pageIndex: number): string {
    return `${MANGA_URL_PREFIX}${encodeURIComponent(chapterId)}/page/${pageIndex}`;
  }

  private _update(meta: MangaChapterMeta): void {
    const map = new Map(this._chapters());
    map.set(meta.id, { ...meta });
    this._chapters.set(map);
    this._persist(meta).catch(() => {});
  }

  private async _persist(meta: MangaChapterMeta): Promise<void> {
    const db = await this._openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(MANGA_META_STORE, "readwrite");
      tx.objectStore(MANGA_META_STORE).put(meta);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  private async _persistQueueEntry(entry: QueueEntry): Promise<void> {
    const db = await this._openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(MANGA_QUEUE_STORE, "readwrite");
      tx.objectStore(MANGA_QUEUE_STORE).put(entry);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  private async _deleteQueueEntry(chapterId: string): Promise<void> {
    const db = await this._openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(MANGA_QUEUE_STORE, "readwrite");
      tx.objectStore(MANGA_QUEUE_STORE).delete(chapterId);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  private async _loadQueueEntry(chapterId: string): Promise<string[] | null> {
    const db = await this._openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(MANGA_QUEUE_STORE, "readonly");
      const req = tx.objectStore(MANGA_QUEUE_STORE).get(chapterId);
      req.onsuccess = () => {
        const entry = req.result as QueueEntry | undefined;
        res(entry?.pageUrls || null);
      };
      req.onerror = () => rej(req.error);
    });
  }

  private async _loadFromDb() {
    try {
      const db = await this._openDb();

      const allMeta = await new Promise<MangaChapterMeta[]>((res, rej) => {
        const tx = db.transaction(MANGA_META_STORE, "readonly");
        const req = tx.objectStore(MANGA_META_STORE).getAll();
        req.onsuccess = () => res(req.result as MangaChapterMeta[]);
        req.onerror = () => rej(req.error);
      });

      const allQueue = await new Promise<QueueEntry[]>((res, rej) => {
        const tx = db.transaction(MANGA_QUEUE_STORE, "readonly");
        const req = tx.objectStore(MANGA_QUEUE_STORE).getAll();
        req.onsuccess = () => res(req.result as QueueEntry[]);
        req.onerror = () => rej(req.error);
      });

      const map = new Map<string, MangaChapterMeta>();
      for (const item of allMeta) {
        map.set(item.id, item);
      }
      this._chapters.set(map);

      this._queueEntries.clear();
      for (const entry of allQueue) {
        this._queueEntries.set(entry.chapterId, entry.pageUrls);
      }
    } catch (err) {
      console.warn("[MangaOffline] Failed to load IndexedDB:", err);
    }
  }

  private _openDb(): Promise<IDBDatabase> {
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise((res, rej) => {
      const req = indexedDB.open(MANGA_META_DB, 2);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MANGA_META_STORE)) {
          db.createObjectStore(MANGA_META_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(MANGA_QUEUE_STORE)) {
          db.createObjectStore(MANGA_QUEUE_STORE, { keyPath: "chapterId" });
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
