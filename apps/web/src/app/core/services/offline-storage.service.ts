/**
 * OfflineStorageService
 *
 * Manages downloading and storing movie files locally for PWA offline playback.
 *
 * Architecture:
 * - Video blobs are stored in the browser's Cache Storage under the
 *   "np-offline-v1" cache, keyed by a virtual URL  "/offline/movie/<id>/<quality>"
 * - Download state (progress, status) is stored in IndexedDB for persistence
 *   across page loads, separate from the blob cache
 * - The SW intercepts fetch requests matching "/offline/movie/*" and serves
 *   from the cache
 * - A server-side record (OfflineSavedContent) is written after a successful
 *   download so the backend knows what content is saved offline per user
 *
 * Constraints:
 * - Only available in browsers that support Cache Storage + fetch (all modern browsers)
 * - Storage quota: browsers allow 60–80% of available disk. We check before downloading.
 * - DRM content (Widevine/FairPlay) cannot be stored — not applicable here as
 *   NaijasPride serves plain MP4/HLS files from R2
 * - Stream-only and YouTube titles are excluded (server-enforced too)
 */

import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// ─── Constants ────────────────────────────────────────────────────────────────

const OFFLINE_CACHE_NAME = 'np-offline-v1';
const OFFLINE_META_DB = 'np_offline_meta_v1';
const OFFLINE_META_STORE = 'downloads';
const OFFLINE_CACHE_URL_PREFIX = '/offline/movie/';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DownloadStatus = 'idle' | 'downloading' | 'complete' | 'error' | 'paused';

export interface OfflineDownloadMeta {
  /** Composite key: movieId + '::' + quality */
  id: string;
  movieId: string;
  movieTitle: string;
  movieSlug: string;
  quality: string;
  thumbnailUrl?: string;
  status: DownloadStatus;
  /** 0–100 */
  progress: number;
  /** bytes downloaded so far */
  bytesDownloaded: number;
  /** total bytes (may be 0 if content-length was absent) */
  totalBytes: number;
  savedAt: number; // timestamp
  error?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class OfflineStorageService {
  private http = inject(HttpClient);

  /** Reactive map of active/completed downloads: id → meta */
  private _downloads = signal<Map<string, OfflineDownloadMeta>>(new Map());

  /** Public reactive list of all downloads */
  readonly downloads = computed(() => [...this._downloads().values()]);

  private _dbPromise: Promise<IDBDatabase> | null = null;
  private _supported: boolean | null = null;

  /** Whether the browser supports offline storage */
  get isSupported(): boolean {
    if (this._supported !== null) return this._supported;
    this._supported =
      typeof caches !== 'undefined' &&
      typeof indexedDB !== 'undefined' &&
      typeof fetch !== 'undefined';
    return this._supported;
  }

  constructor() {
    if (this.isSupported) {
      this._loadMetaFromDb();
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Returns the cached blob URL for a movie, or null if not downloaded */
  async getOfflineUrl(movieId: string, quality: string): Promise<string | null> {
    if (!this.isSupported) return null;
    try {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      const key = this._cacheKey(movieId, quality);
      const match = await cache.match(key);
      if (!match) return null;
      const blob = await match.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  /** Check if a movie quality is available offline */
  isAvailableOffline(movieId: string, quality: string): boolean {
    const id = this._metaId(movieId, quality);
    const meta = this._downloads().get(id);
    return meta?.status === 'complete';
  }

  /** Return download progress (0-100) or null if not downloading */
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

  /**
   * Start downloading a movie for offline playback.
   * Streams the file with fetch + ReadableStream, writing progress to IndexedDB.
   */
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
    if (existing?.status === 'downloading') return; // already in progress
    if (existing?.status === 'complete') return;    // already saved

    // Check available storage
    const hasSpace = await this._checkStorageQuota(fileSizeBytes ?? 0);
    if (!hasSpace) {
      throw new Error('Not enough storage space on this device. Free up space and try again.');
    }

    const meta: OfflineDownloadMeta = {
      id,
      movieId,
      movieTitle,
      movieSlug,
      quality,
      thumbnailUrl,
      status: 'downloading',
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: fileSizeBytes ?? 0,
      savedAt: Date.now(),
    };

    this._updateMeta(meta);

    try {
      const response = await fetch(fileUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
      const total = contentLength || fileSizeBytes || 0;
      meta.totalBytes = total;

      // Stream the response body
      const reader = response.body?.getReader();
      if (!reader) throw new Error('ReadableStream not supported');

      const chunks: Uint8Array[] = [];
      let downloaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          downloaded += value.length;
          meta.bytesDownloaded = downloaded;
          meta.progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          this._updateMeta({ ...meta });
        }
      }

      // Assemble blob and store in Cache Storage
      const blob = new Blob(chunks);
      const cacheKey = this._cacheKey(movieId, quality);
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      await cache.put(cacheKey, new Response(blob, {
        headers: {
          'Content-Type': this._mimeForQuality(quality),
          'Content-Length': String(blob.size),
        },
      }));

      meta.status = 'complete';
      meta.progress = 100;
      meta.bytesDownloaded = blob.size;
      meta.totalBytes = blob.size;
      this._updateMeta(meta);

      // Record on server (fire-and-forget — UI should still work if this fails)
      firstValueFrom(
        this.http.post('/api/v1/profile/offline', {
          movieId,
          quality,
          fileSizeBytes: blob.size,
        })
      ).catch(console.error);

    } catch (err) {
      meta.status = 'error';
      meta.error = err instanceof Error ? err.message : 'Download failed';
      this._updateMeta(meta);
      throw err;
    }
  }

  /** Delete a downloaded movie from local storage */
  async remove(movieId: string, quality: string): Promise<void> {
    const id = this._metaId(movieId, quality);
    try {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      await cache.delete(this._cacheKey(movieId, quality));
    } catch { /* cache may not exist */ }

    // Remove from IndexedDB
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

    // Notify server (fire-and-forget)
    firstValueFrom(
      this.http.delete('/api/v1/profile/offline', {
        body: { movieId, quality },
      })
    ).catch(console.error);
  }

  /** Clear ALL offline downloads */
  async clearAll(): Promise<void> {
    try {
      await caches.delete(OFFLINE_CACHE_NAME);
    } catch { /* ignore */ }

    const db = await this._openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OFFLINE_META_STORE, 'readwrite');
      tx.objectStore(OFFLINE_META_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    this._downloads.set(new Map());
  }

  /** Get estimated storage usage */
  async getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
    if (!navigator.storage?.estimate) return null;
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  private _metaId(movieId: string, quality: string) {
    return `${movieId}::${quality}`;
  }

  private _cacheKey(movieId: string, quality: string) {
    return `${OFFLINE_CACHE_URL_PREFIX}${movieId}/${quality}`;
  }

  private _mimeForQuality(quality: string): string {
    // All our files are MP4 (HLS manifests are not stored as offline blobs)
    return 'video/mp4';
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
        // Stale "downloading" entries from a previous interrupted session → mark as error
        if (item.status === 'downloading' || item.status === 'paused') {
          item.status = 'error';
          item.error = 'Download was interrupted. Tap to retry.';
        }
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
      const req = indexedDB.open(OFFLINE_META_DB, 1);
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
    if (!navigator.storage?.estimate) return true; // assume OK if API unavailable
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const available = quota - usage;
      // Need at least the file size + 50 MB headroom
      return available > neededBytes + 50 * 1024 * 1024;
    } catch {
      return true;
    }
  }
}
