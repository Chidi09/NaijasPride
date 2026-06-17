import { Injectable } from "@angular/core";

import type {
  BookmarkEntry,
  EpubProgress,
  HighlightEntry,
  PdfProgress,
  ReaderSettings,
} from "../models/reader.models";

const safeJsonParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

@Injectable({
  providedIn: "root",
})
export class ReaderStorageService {
  private readonly SETTINGS_KEY_V2 = "np_book_reader_settings_v2";
  private readonly SETTINGS_KEY_V1 = "np_book_reader_settings_v1";

  private readonly EPUB_PROGRESS_PREFIX_V2 = "np_book_progress_v2_";
  private readonly EPUB_PROGRESS_PREFIX_V1 = "np_book_progress_v1_";

  private readonly PDF_PROGRESS_PREFIX_V2 = "np_book_pdf_progress_v2_";
  private readonly PDF_PROGRESS_PREFIX_V1 = "np_book_pdf_progress_v1_";

  private readonly BOOKMARKS_PREFIX_V2 = "np_book_bookmarks_v2_";
  private readonly BOOKMARKS_PREFIX_V1 = "np_book_bookmarks_v1_";

  private readonly HIGHLIGHTS_PREFIX_V1 = "np_book_highlights_v1_";

  getDefaultSettings(): ReaderSettings {
    return {
      flow: "paginated",
      spread: "single",
      theme: "paper",
      fontFamily: "serif",
      fontSize: 110,
      lineHeight: 1.6,
      autoScrollEnabled: false,
      autoScrollSpeed: 18,
      pdfZoom: 1.15,
      highlightColor: "yellow",
      ttsRate: 1.0,
      ttsVoiceUri: null,
    };
  }

  loadSettings(): ReaderSettings {
    const raw =
      localStorage.getItem(this.SETTINGS_KEY_V2) ||
      localStorage.getItem(this.SETTINGS_KEY_V1);
    const saved = safeJsonParse<Partial<ReaderSettings>>(raw, {});
    const defaults = this.getDefaultSettings();

    const normalized: ReaderSettings = {
      flow:
        saved.flow === "paginated" || saved.flow === "scrolled"
          ? saved.flow
          : defaults.flow,
      spread:
        saved.spread === "auto" ||
        saved.spread === "single" ||
        saved.spread === "double"
          ? saved.spread
          : defaults.spread,
      theme:
        saved.theme === "paper" ||
        saved.theme === "sepia" ||
        saved.theme === "night"
          ? saved.theme
          : defaults.theme,
      fontFamily:
        saved.fontFamily === "serif" ||
        saved.fontFamily === "sans" ||
        saved.fontFamily === "mono"
          ? saved.fontFamily
          : defaults.fontFamily,
      fontSize:
        typeof saved.fontSize === "number"
          ? Math.max(80, Math.min(180, Math.round(saved.fontSize)))
          : defaults.fontSize,
      lineHeight:
        typeof saved.lineHeight === "number"
          ? Math.max(1.2, Math.min(2.2, Math.round(saved.lineHeight * 10) / 10))
          : defaults.lineHeight,
      autoScrollEnabled:
        typeof saved.autoScrollEnabled === "boolean"
          ? saved.autoScrollEnabled
          : defaults.autoScrollEnabled,
      autoScrollSpeed:
        typeof saved.autoScrollSpeed === "number"
          ? Math.max(4, Math.min(80, Math.round(saved.autoScrollSpeed)))
          : defaults.autoScrollSpeed,
      pdfZoom:
        typeof saved.pdfZoom === "number"
          ? Math.max(0.6, Math.min(2.6, Math.round(saved.pdfZoom * 10) / 10))
          : defaults.pdfZoom,
      highlightColor:
        saved.highlightColor === "yellow" ||
        saved.highlightColor === "green" ||
        saved.highlightColor === "blue" ||
        saved.highlightColor === "pink"
          ? saved.highlightColor
          : defaults.highlightColor,
      ttsRate:
        typeof saved.ttsRate === "number"
          ? Math.max(0.6, Math.min(1.6, Math.round(saved.ttsRate * 10) / 10))
          : defaults.ttsRate,
      ttsVoiceUri:
        typeof saved.ttsVoiceUri === "string"
          ? saved.ttsVoiceUri
          : defaults.ttsVoiceUri,
    };

    if (!localStorage.getItem(this.SETTINGS_KEY_V2)) {
      this.saveSettings(normalized);
    }
    return normalized;
  }

  saveSettings(settings: ReaderSettings): void {
    try {
      localStorage.setItem(this.SETTINGS_KEY_V2, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }

  loadEpubProgress(slug: string): EpubProgress | null {
    const raw =
      localStorage.getItem(this.EPUB_PROGRESS_PREFIX_V2 + slug) ||
      localStorage.getItem(this.EPUB_PROGRESS_PREFIX_V1 + slug);
    const saved = safeJsonParse<{ cfi?: string; at?: number }>(raw, {});

    const cfi = typeof saved.cfi === "string" ? saved.cfi.trim() : "";
    if (!cfi) return null;
    const at =
      typeof saved.at === "number" && Number.isFinite(saved.at) ? saved.at : 0;

    const value: EpubProgress = { cfi, at };
    if (!localStorage.getItem(this.EPUB_PROGRESS_PREFIX_V2 + slug)) {
      this.saveEpubProgress(slug, value);
    }
    return value;
  }

  saveEpubProgress(slug: string, progress: EpubProgress): void {
    try {
      localStorage.setItem(
        this.EPUB_PROGRESS_PREFIX_V2 + slug,
        JSON.stringify({ cfi: progress.cfi, at: progress.at }),
      );
    } catch {
      // ignore
    }
  }

  loadPdfProgress(slug: string): PdfProgress | null {
    const raw =
      localStorage.getItem(this.PDF_PROGRESS_PREFIX_V2 + slug) ||
      localStorage.getItem(this.PDF_PROGRESS_PREFIX_V1 + slug);
    const saved = safeJsonParse<{ page?: number; at?: number }>(raw, {});

    const page =
      typeof saved.page === "number" && Number.isFinite(saved.page)
        ? Math.floor(saved.page)
        : 0;
    if (page <= 0) return null;

    const at =
      typeof saved.at === "number" && Number.isFinite(saved.at) ? saved.at : 0;
    const value: PdfProgress = { page, at };
    if (!localStorage.getItem(this.PDF_PROGRESS_PREFIX_V2 + slug)) {
      this.savePdfProgress(slug, value);
    }
    return value;
  }

  savePdfProgress(slug: string, progress: PdfProgress): void {
    try {
      localStorage.setItem(
        this.PDF_PROGRESS_PREFIX_V2 + slug,
        JSON.stringify({ page: progress.page, at: progress.at }),
      );
    } catch {
      // ignore
    }
  }

  loadBookmarks(slug: string): BookmarkEntry[] {
    const raw =
      localStorage.getItem(this.BOOKMARKS_PREFIX_V2 + slug) ||
      localStorage.getItem(this.BOOKMARKS_PREFIX_V1 + slug);
    const list = safeJsonParse<BookmarkEntry[]>(raw, []);
    const normalized = Array.isArray(list) ? list : [];
    if (
      !localStorage.getItem(this.BOOKMARKS_PREFIX_V2 + slug) &&
      normalized.length > 0
    ) {
      this.saveBookmarks(slug, normalized);
    }
    return normalized;
  }

  saveBookmarks(slug: string, bookmarks: BookmarkEntry[]): void {
    try {
      localStorage.setItem(
        this.BOOKMARKS_PREFIX_V2 + slug,
        JSON.stringify(bookmarks.slice(0, 200)),
      );
    } catch {
      // ignore
    }
  }

  loadHighlights(slug: string): HighlightEntry[] {
    const raw = localStorage.getItem(this.HIGHLIGHTS_PREFIX_V1 + slug);
    const list = safeJsonParse<HighlightEntry[]>(raw, []);
    return Array.isArray(list) ? list : [];
  }

  saveHighlights(slug: string, highlights: HighlightEntry[]): void {
    try {
      localStorage.setItem(
        this.HIGHLIGHTS_PREFIX_V1 + slug,
        JSON.stringify(highlights.slice(0, 1000)),
      );
    } catch {
      // ignore
    }
  }
}
