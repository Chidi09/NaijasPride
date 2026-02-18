/**
 * BookOfflineService
 *
 * Offline book downloader with persisted queue + stream-to-cache writes.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const BOOK_CACHE = 'np-books-v1';
const BOOK_META_DB = 'np_book_offline_v1';
const BOOK_META_STORE = 'books';
const BOOK_URL_PREFIX = '/offline/book/';

const MAX_PARALLEL_DOWNLOADS = 1;
const PERSIST_INTERVAL_MS = 250;

export type BookDLStatus = 'idle' | 'queued' | 'downloading' | 'complete' | 'error';

export interface BookOfflineMeta {
  id: string;
  bookId: string;
  bookTitle: string;
  bookSlug: string;
  author: string;
  format: string;
  apiFileUrl: string;
  coverUrl?: string;
  status: BookDLStatus;
  progress: number;
  fileSizeBytes: number;
  savedAt: number;
  retryCount: number;
  error?: string;
}

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

@Injectable({ providedIn: 'root' })
export class BookOfflineService {
  private http = inject(HttpClient);

  private _books = signal<Map<string, BookOfflineMeta>>(new Map());
  readonly books = computed(() => [...this._books().values()]);

  private _dbPromise: Promise<IDBDatabase> | null = null;
  private _queue: string[] = [];
  private _active = new Map<string, AbortController>();
  private _deferred = new Map<string, Deferred>();
  private _isProcessing = false;

  get isSupported(): boolean {
    return typeof caches !== 'undefined' && typeof indexedDB !== 'undefined' && typeof ReadableStream !== 'undefined';
  }

  constructor() {
    if (this.isSupported) {
      this._loadFromDb()
        .then(() => this._restoreQueue())
        .catch((err) => console.warn('[BookOffline] Init failed:', err));
    }
  }

  isAvailable(bookId: string): boolean {
    return this._books().get(bookId)?.status === 'complete';
  }

  getStatus(bookId: string): BookDLStatus {
    return this._books().get(bookId)?.status ?? 'idle';
  }

  getProgress(bookId: string): number {
    return this._books().get(bookId)?.progress ?? 0;
  }

  getOfflineFileUrl(bookId: string): string {
    return `${BOOK_URL_PREFIX}${bookId}/file`;
  }

  async download(params: {
    bookId: string;
    bookTitle: string;
    bookSlug: string;
    author: string;
    format: string;
    apiFileUrl: string;
    coverUrl?: string;
    fileSizeBytes?: number;
  }): Promise<void> {
    if (!this.isSupported) throw new Error('Offline storage not supported');

    const { bookId } = params;
    const existing = this._books().get(bookId);
    if (existing?.status === 'complete') return;
    if (existing?.status === 'downloading' || existing?.status === 'queued') {
      return this._getDeferred(bookId).promise;
    }

    const meta: BookOfflineMeta = {
      id: bookId,
      bookId,
      bookTitle: params.bookTitle,
      bookSlug: params.bookSlug,
      author: params.author,
      format: params.format,
      apiFileUrl: params.apiFileUrl,
      coverUrl: params.coverUrl,
      status: 'queued',
      progress: 0,
      fileSizeBytes: params.fileSizeBytes ?? existing?.fileSizeBytes ?? 0,
      savedAt: Date.now(),
      retryCount: existing?.retryCount ?? 0,
      error: undefined,
    };

    this._update(meta);
    this._enqueue(bookId);
    void this._processQueue();

    return this._getDeferred(bookId).promise;
  }

  async remove(bookId: string): Promise<void> {
    const active = this._active.get(bookId);
    if (active) {
      active.abort();
      this._active.delete(bookId);
    }

    this._queue = this._queue.filter((id) => id !== bookId);

    try {
      const cache = await caches.open(BOOK_CACHE);
      await cache.delete(this.getOfflineFileUrl(bookId));
    } catch {
      // ignore
    }

    const db = await this._openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(BOOK_META_STORE, 'readwrite');
      tx.objectStore(BOOK_META_STORE).delete(bookId);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    const map = new Map(this._books());
    map.delete(bookId);
    this._books.set(map);

    this._rejectDeferred(bookId, new Error('Download removed'));

    firstValueFrom(this.http.delete(`/api/v1/library/books/offline/${bookId}`)).catch(console.error);
  }

  private _enqueue(bookId: string) {
    if (this._queue.includes(bookId)) return;
    this._queue.push(bookId);
  }

  private _restoreQueue() {
    const map = new Map(this._books());
    for (const item of map.values()) {
      if ((item.status === 'queued' || item.status === 'downloading') && item.apiFileUrl) {
        item.status = 'queued';
        item.error = undefined;
        this._enqueue(item.bookId);
      } else if (item.status === 'queued' || item.status === 'downloading') {
        item.status = 'error';
        item.error = 'Download metadata missing. Retry download.';
      }
    }
    this._books.set(map);

    if (this._queue.length > 0) {
      void this._processQueue();
    }
  }

  private async _processQueue() {
    if (this._isProcessing) return;
    this._isProcessing = true;

    try {
      while (this._queue.length > 0) {
        if (this._active.size >= MAX_PARALLEL_DOWNLOADS) break;
        const bookId = this._queue.shift();
        if (!bookId) continue;

        const meta = this._books().get(bookId);
        if (!meta || meta.status === 'complete') {
          this._resolveDeferred(bookId);
          continue;
        }

        try {
          await this._downloadOne(meta);
          this._resolveDeferred(bookId);
        } catch (error) {
          this._rejectDeferred(bookId, error);
        }
      }
    } finally {
      this._isProcessing = false;
      if (this._queue.length > 0 && this._active.size < MAX_PARALLEL_DOWNLOADS) {
        void this._processQueue();
      }
    }
  }

  private async _downloadOne(meta: BookOfflineMeta): Promise<void> {
    const controller = new AbortController();
    this._active.set(meta.bookId, controller);

    const current: BookOfflineMeta = {
      ...meta,
      status: 'downloading',
      progress: 0,
      error: undefined,
    };
    this._update(current);

    try {
      const response = await fetch(current.apiFileUrl, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error('ReadableStream not supported');

      const contentLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
      const total = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : current.fileSizeBytes;

      const [cacheStream, progressStream] = response.body.tee();

      const mimeType = current.format.toLowerCase() === 'pdf' ? 'application/pdf' : 'application/epub+zip';
      const headers = new Headers({
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${current.bookSlug}.${current.format.toLowerCase()}"`,
      });
      if (total > 0) {
        headers.set('Content-Length', String(total));
      }

      const cache = await caches.open(BOOK_CACHE);
      const cacheKey = this.getOfflineFileUrl(current.bookId);
      const cachePromise = cache.put(cacheKey, new Response(cacheStream, { headers }));

      const reader = progressStream.getReader();
      let downloaded = 0;
      let lastPersist = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        downloaded += value.byteLength;
        const now = Date.now();
        if (now - lastPersist < PERSIST_INTERVAL_MS) continue;
        lastPersist = now;

        current.progress = total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 0;
        current.fileSizeBytes = downloaded;
        this._update({ ...current });
      }

      await cachePromise;

      const done: BookOfflineMeta = {
        ...current,
        status: 'complete',
        progress: 100,
        fileSizeBytes: total > 0 ? total : downloaded,
        savedAt: Date.now(),
        retryCount: 0,
      };
      this._update(done);

      firstValueFrom(
        this.http.post('/api/v1/library/books/offline', {
          bookId: current.bookId,
          format: current.format,
          fileSizeBytes: done.fileSizeBytes,
        }),
      ).catch(console.error);
    } catch (err) {
      const reason = err instanceof DOMException && err.name === 'AbortError'
        ? 'Download cancelled'
        : err instanceof Error
          ? err.message
          : 'Download failed';

      this._update({
        ...current,
        status: 'error',
        retryCount: (current.retryCount || 0) + 1,
        error: reason,
      });

      firstValueFrom(
        this.http.post('/api/v1/library/books/offline/failure', {
          bookId: current.bookId,
          reason,
        }),
      ).catch(console.error);

      throw err;
    } finally {
      this._active.delete(meta.bookId);
    }
  }

  private _update(meta: BookOfflineMeta): void {
    const map = new Map(this._books());
    map.set(meta.id, { ...meta });
    this._books.set(map);
    this._persist(meta).catch(console.error);
  }

  private async _persist(meta: BookOfflineMeta): Promise<void> {
    const db = await this._openDb();
    return new Promise((res, rej) => {
      const tx = db.transaction(BOOK_META_STORE, 'readwrite');
      tx.objectStore(BOOK_META_STORE).put(meta);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  private async _loadFromDb() {
    try {
      const db = await this._openDb();
      const all = await new Promise<BookOfflineMeta[]>((res, rej) => {
        const tx = db.transaction(BOOK_META_STORE, 'readonly');
        const req = tx.objectStore(BOOK_META_STORE).getAll();
        req.onsuccess = () => res(req.result as BookOfflineMeta[]);
        req.onerror = () => rej(req.error);
      });
      const map = new Map<string, BookOfflineMeta>();
      for (const item of all) {
        map.set(item.id, item);
      }
      this._books.set(map);
    } catch (err) {
      console.warn('[BookOffline] Failed to load IndexedDB:', err);
    }
  }

  private _openDb(): Promise<IDBDatabase> {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((res, rej) => {
      const req = indexedDB.open(BOOK_META_DB, 2);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(BOOK_META_STORE)) {
          db.createObjectStore(BOOK_META_STORE, { keyPath: 'id' });
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

  private _getDeferred(id: string): Deferred {
    const existing = this._deferred.get(id);
    if (existing) return existing;

    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const deferred = { promise, resolve, reject };
    this._deferred.set(id, deferred);
    return deferred;
  }

  private _resolveDeferred(id: string) {
    const deferred = this._deferred.get(id);
    if (!deferred) return;
    deferred.resolve();
    this._deferred.delete(id);
  }

  private _rejectDeferred(id: string, error: unknown) {
    const deferred = this._deferred.get(id);
    if (!deferred) return;
    deferred.reject(error);
    this._deferred.delete(id);
  }
}
