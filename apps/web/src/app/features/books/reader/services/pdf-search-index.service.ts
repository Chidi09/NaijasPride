import { Injectable } from "@angular/core";

type PageKey = {
  slug: string;
  version: string;
  page: number;
};

type PageRow = {
  id: string;
  slug: string;
  version: string;
  page: number;
  text: string;
  updatedAt: number;
  sv: string;
};

const DB_NAME = "np_reader_pdf_search_v1";
const DB_VERSION = 1;
const STORE = "pages";

@Injectable({
  providedIn: "root",
})
export class PdfSearchIndexService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async getPageText(key: PageKey): Promise<string | null> {
    try {
      const db = await this.open();
      const id = this.rowId(key);
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const req = store.get(id);
        req.onsuccess = () => {
          const row = req.result as PageRow | undefined;
          resolve(row?.text ?? null);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async setPageText(key: PageKey, text: string): Promise<void> {
    try {
      const db = await this.open();
      const now = Date.now();
      const row: PageRow = {
        id: this.rowId(key),
        slug: key.slug,
        version: key.version,
        page: key.page,
        text,
        updatedAt: now,
        sv: this.slugVersion(key.slug, key.version),
      };

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const req = store.put(row);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // ignore
    }
  }

  async clearForSlugVersion(slug: string, version: string): Promise<void> {
    try {
      const db = await this.open();
      const sv = this.slugVersion(slug, version);

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const index = store.index("sv");
        const range = IDBKeyRange.only(sv);
        const req = index.openCursor(range);
        req.onsuccess = () => {
          const cursor = req.result as IDBCursorWithValue | null;
          if (!cursor) {
            resolve();
            return;
          }
          cursor.delete();
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      // ignore
    }
  }

  private async open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("sv", "sv", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  private slugVersion(slug: string, version: string): string {
    return `${slug}::${version}`;
  }

  private rowId(key: PageKey): string {
    return `${key.slug}::${key.version}::${key.page}`;
  }
}
