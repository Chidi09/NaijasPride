/**
 * OfflineStorageService
 *
 * Movie offline downloader for NaijasPride PWA.
 *
 * Improvements over the initial implementation:
 * - Serial queue (prevents bandwidth saturation)
 * - Queue persistence across reloads (queued/downloading jobs auto-resume)
 * - Stream-to-cache via ReadableStream.tee() (no full-file memory buffering)
 * - Failure reporting endpoint for push + monitoring
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

const OFFLINE_CACHE_NAME = 'np-offline-v1';
const OFFLINE_META_DB = 'np_offline_meta_v1';
const OFFLINE_META_STORE = 'downloads';
const OFFLINE_CACHE_URL_PREFIX = '/offline/movie/';

const MAX_PARALLEL_DOWNLOADS = 1;
const MAX_BATCH_PERSIST_INTERVAL_MS = 250;

export type DownloadStatus = 'idle' | 'queued' | 'downloading' | 'complete' | 'error' | 'paused';

export interface OfflineDownloadMeta {
  id: string;
  movieId: string;
  movieTitle: string;
  movieSlug: string;
  quality: string;
  fileUrl: string;
  thumbnailUrl?: string;
  status: DownloadStatus;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
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
export class OfflineStorageService {
  private http = inject(HttpClient);

  private _downloads = signal<Map<string, OfflineDownloadMeta>>(new Map());
  readonly downloads = computed(() => [...this._downloads().values()]);

  private _dbPromise: Promise<IDBDatabase> | null = null;
  private _supported: boolean | null = null;

  private _queue: string[] = [];
  private _active = new Map<string, AbortController>();
  private _deferred = new Map<string, Deferred>();
  private _isProcessing = false;

  get isSupported(): boolean {
    if (this._supported !== null) return this._supported;
    this._supported =
      typeof caches !== 'undefined' &&
      typeof indexedDB !== 'undefined' &&
      typeof fetch !== 'undefined' &&
      typeof ReadableStream !== 'undefined';
    return this._supported;
  }

  constructor() {
    if (this.isSupported) {
      this._loadMetaFromDb()
        .then(() => this._restoreQueue())
        .catch((err) => console.warn('[OfflineStorage] Init failed:', err));
    }
  }

  async getOfflineUrl(movieId: string, quality: string): Promise<string | null> {
    if (!this.isSupported) return null;
    try {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      const key = this._cacheKey(movieId, quality);
      const match = await cache.match(key);
      return match ? key : null;
    } catch {
      return null;
    }
  }

  isAvailableOffline(movieId: string, quality: string): boolean {
    const id = this._metaId(movieId, quality);
    return this._downloads().get(id)?.status === 'complete';
  }

  getProgress(movieId: string, quality: string): number | null {
    const id = this._metaId(movieId, quality);
    const meta = this._downloads().get(id);
    if (!meta || meta.status === 'idle') return null;
    return meta.progress;
  }

  getStatus(movieId: string, quality: string): DownloadStatus {
    const id = this._metaId(movieId, quality);
    return this._downloads().get(id)?.status ?? 'idle';
  }

  async download(params: {
    movieId: string;
    movieTitle: string;
    movieSlug: string;
    quality: string;
    fileUrl: string;
    fileSizeBytes?: number;
    thumbnailUrl?: string;
  }): Promise<void> {
    if (!this.isSupported) {
      throw new Error('Offline storage is not supported in this browser.');
    }

    const { movieId, movieTitle, movieSlug, quality, fileUrl, fileSizeBytes, thumbnailUrl } = params;
    const id = this._metaId(movieId, quality);
    const existing = this._downloads().get(id);

    if (existing?.status === 'complete') return;
    if (existing?.status === 'downloading' || existing?.status === 'queued') {
      return this._getDeferred(id).promise;
    }

    if (!existing || existing.status === 'error' || existing.status === 'paused') {
      const hasSpace = await this._checkStorageQuota(fileSizeBytes ?? 0);
      if (!hasSpace) {
        throw new Error('Not enough storage space on this device. Free up space and try again.');
      }
    }

    const meta: OfflineDownloadMeta = {
      id,
      movieId,
      movieTitle,
      movieSlug,
      quality,
      fileUrl,
      thumbnailUrl,
      status: 'queued',
      progress: existing?.status === 'paused' ? existing.progress : 0,
      bytesDownloaded: 0,
      totalBytes: fileSizeBytes ?? existing?.totalBytes ?? 0,
      savedAt: Date.now(),
      retryCount: existing?.retryCount ?? 0,
      error: undefined,
    };

    this._updateMeta(meta);
    this._enqueue(id);
    void this._processQueue();

    return this._getDeferred(id).promise;
  }

  async remove(movieId: string, quality: string): Promise<void> {
    const id = this._metaId(movieId, quality);

    const active = this._active.get(id);
    if (active) {
      active.abort();
      this._active.delete(id);
    }

    this._queue = this._queue.filter((entry) => entry !== id);

    try {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      await cache.delete(this._cacheKey(movieId, quality));
    } catch {
      // ignore cache deletion failures
    }

    const db = await this._openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OFFLINE_META_STORE, 'readwrite');
      tx.objectStore(OFFLINE_META_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const map = new Map(this._downloads());
    map.delete(id);
    this._downloads.set(map);

    this._rejectDeferred(id, new Error('Download removed'));

    firstValueFrom(
      this.http.delete('/api/v1/profile/offline', {
        body: { movieId, quality },
      }),
    ).catch(console.error);
  }

  async clearAll(): Promise<void> {
    for (const [, controller] of this._active.entries()) {
      controller.abort();
    }
    this._active.clear();
    this._queue = [];

    try {
      await caches.delete(OFFLINE_CACHE_NAME);
    } catch {
      // ignore
    }

    const db = await this._openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OFFLINE_META_STORE, 'readwrite');
      tx.objectStore(OFFLINE_META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    this._downloads.set(new Map());

    for (const id of this._deferred.keys()) {
      this._rejectDeferred(id, new Error('Downloads cleared'));
    }
  }

  async getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
    if (!navigator.storage?.estimate) return null;
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  }

  private _metaId(movieId: string, quality: string): string {
    return `${movieId}::${quality}`;
  }

  private _cacheKey(movieId: string, quality: string): string {
    return `${OFFLINE_CACHE_URL_PREFIX}${movieId}/${quality}`;
  }

  private _mimeForQuality(): string {
    return 'video/mp4';
  }

  private _enqueue(id: string): void {
    if (this._queue.includes(id)) return;
    this._queue.push(id);
  }

  private _restoreQueue(): void {
    const items = [...this._downloads().values()];
    const map = new Map(this._downloads());

    for (const item of items) {
      if ((item.status === 'queued' || item.status === 'downloading' || item.status === 'paused') && item.fileUrl) {
        map.set(item.id, { ...item, status: 'queued', error: undefined });
        this._enqueue(item.id);
      } else if (item.status === 'queued' || item.status === 'downloading' || item.status === 'paused') {
        map.set(item.id, {
          ...item,
          status: 'error',
          error: 'Download metadata is incomplete. Retry download.',
        });
      }
    }

    this._downloads.set(map);
    if (this._queue.length > 0) {
      void this._processQueue();
    }
  }

  private async _processQueue(): Promise<void> {
    if (this._isProcessing) return;
    this._isProcessing = true;

    try {
      while (this._queue.length > 0) {
        const activeCount = this._active.size;
        if (activeCount >= MAX_PARALLEL_DOWNLOADS) break;

        const id = this._queue.shift();
        if (!id) continue;
        const meta = this._downloads().get(id);
        if (!meta || meta.status === 'complete') {
          this._resolveDeferred(id);
          continue;
        }

        try {
          await this._downloadOne(meta);
          this._resolveDeferred(id);
        } catch (error) {
          this._rejectDeferred(id, error);
        }
      }
    } finally {
      this._isProcessing = false;
      if (this._queue.length > 0 && this._active.size < MAX_PARALLEL_DOWNLOADS) {
        void this._processQueue();
      }
    }
  }

  private async _downloadOne(meta: OfflineDownloadMeta): Promise<void> {
    const controller = new AbortController();
    this._active.set(meta.id, controller);

    const current: OfflineDownloadMeta = {
      ...meta,
      status: 'downloading',
      progress: 0,
      bytesDownloaded: 0,
      error: undefined,
    };
    this._updateMeta(current);

    try {
      const response = await fetch(current.fileUrl, {
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error('ReadableStream not supported by this response');

      const contentLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
      const totalBytes = Number.isFinite(contentLength) && contentLength > 0
        ? contentLength
        : current.totalBytes;

      current.totalBytes = totalBytes;
      this._updateMeta(current);

      const [cacheStream, progressStream] = response.body.tee();
      const cacheKey = this._cacheKey(current.movieId, current.quality);

      const contentType = response.headers.get('content-type') || this._mimeForQuality();
      const headers = new Headers({
        'Content-Type': contentType,
      });
      if (totalBytes > 0) {
        headers.set('Content-Length', String(totalBytes));
      }

      const cachePutPromise = caches.open(OFFLINE_CACHE_NAME).then((cache) =>
        cache.put(cacheKey, new Response(cacheStream, { headers })),
      );

      const reader = progressStream.getReader();
      let downloaded = 0;
      let lastPersistAt = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        downloaded += value.byteLength;
        const now = Date.now();
        const shouldPersist = now - lastPersistAt >= MAX_BATCH_PERSIST_INTERVAL_MS;
        if (!shouldPersist) continue;

        lastPersistAt = now;
        current.bytesDownloaded = downloaded;
        current.progress = totalBytes > 0 ? Math.min(99, Math.round((downloaded / totalBytes) * 100)) : 0;
        this._updateMeta({ ...current });
      }

      await cachePutPromise;

      current.status = 'complete';
      current.progress = 100;
      current.bytesDownloaded = totalBytes > 0 ? totalBytes : downloaded;
      current.totalBytes = totalBytes > 0 ? totalBytes : downloaded;
      current.savedAt = Date.now();
      current.retryCount = 0;
      this._updateMeta({ ...current });

      firstValueFrom(
        this.http.post('/api/v1/profile/offline', {
          movieId: current.movieId,
          quality: current.quality,
          fileSizeBytes: current.bytesDownloaded,
        }),
      ).catch(console.error);
    } catch (error) {
      const reason = error instanceof DOMException && error.name === 'AbortError'
        ? 'Download cancelled'
        : error instanceof Error
          ? error.message
          : 'Download failed';

      const failed: OfflineDownloadMeta = {
        ...current,
        status: 'error',
        error: reason,
        retryCount: (current.retryCount || 0) + 1,
      };
      this._updateMeta(failed);

      firstValueFrom(
        this.http.post('/api/v1/profile/offline/failure', {
          movieId: failed.movieId,
          quality: failed.quality,
          reason,
        }),
      ).catch(console.error);

      throw error;
    } finally {
      this._active.delete(meta.id);
    }
  }

  private _updateMeta(meta: OfflineDownloadMeta): void {
    const map = new Map(this._downloads());
    map.set(meta.id, { ...meta });
    this._downloads.set(map);
    this._persistMeta(meta).catch(console.error);
  }

  private async _persistMeta(meta: OfflineDownloadMeta): Promise<void> {
    const db = await this._openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_META_STORE, 'readwrite');
      tx.objectStore(OFFLINE_META_STORE).put(meta);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async _loadMetaFromDb(): Promise<void> {
    try {
      const db = await this._openDb();
      const items = await new Promise<OfflineDownloadMeta[]>((resolve, reject) => {
        const tx = db.transaction(OFFLINE_META_STORE, 'readonly');
        const req = tx.objectStore(OFFLINE_META_STORE).getAll();
        req.onsuccess = () => resolve(req.result as OfflineDownloadMeta[]);
        req.onerror = () => reject(req.error);
      });

      const map = new Map<string, OfflineDownloadMeta>();
      for (const item of items) {
        map.set(item.id, item);
      }
      this._downloads.set(map);
    } catch (err) {
      console.warn('[OfflineStorage] Failed to load meta from IndexedDB:', err);
    }
  }

  private _openDb(): Promise<IDBDatabase> {
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(OFFLINE_META_DB, 2);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(OFFLINE_META_STORE)) {
          db.createObjectStore(OFFLINE_META_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
      req.onerror = (e) => {
        this._dbPromise = null;
        reject((e.target as IDBOpenDBRequest).error);
      };
    });

    return this._dbPromise;
  }

  private async _checkStorageQuota(neededBytes: number): Promise<boolean> {
    if (!navigator.storage?.estimate) return true;
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const available = quota - usage;
      return available > neededBytes + 50 * 1024 * 1024;
    } catch {
      return true;
    }
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

  private _resolveDeferred(id: string): void {
    const deferred = this._deferred.get(id);
    if (!deferred) return;
    deferred.resolve();
    this._deferred.delete(id);
  }

  private _rejectDeferred(id: string, error: unknown): void {
    const deferred = this._deferred.get(id);
    if (!deferred) return;
    deferred.reject(error);
    this._deferred.delete(id);
  }
}
