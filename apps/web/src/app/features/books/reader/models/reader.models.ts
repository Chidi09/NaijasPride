export type ReaderFlow = 'paginated' | 'scrolled';
export type ReaderTheme = 'paper' | 'sepia' | 'night';
export type ReaderSpread = 'auto' | 'single' | 'double';
export type ReaderFontFamily = 'serif' | 'sans' | 'mono';

export interface ReaderSettings {
  flow: ReaderFlow;
  spread: ReaderSpread;
  theme: ReaderTheme;
  fontFamily: ReaderFontFamily;
  fontSize: number;
  lineHeight: number;
  autoScrollEnabled: boolean;
  autoScrollSpeed: number;
  pdfZoom: number;
  highlightColor?: HighlightColor;
  ttsRate?: number;
  ttsVoiceUri?: string | null;
}

export interface EpubProgress {
  cfi: string;
  at: number;
}

export interface PdfProgress {
  page: number;
  at: number;
}

export interface BookmarkEntry {
  id: string;
  cfi: string;
  label: string;
  createdAt: number;
}

export interface TocEntry {
  label: string;
  href: string;
  level: number;
}

export interface SearchResultEntry {
  cfi: string;
  excerpt: string;
  href: string;
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export type HighlightEntry =
  | {
      id: string;
      kind: 'epub';
      cfiRange: string;
      excerpt: string;
      color: HighlightColor;
      createdAt: number;
    }
  | {
      id: string;
      kind: 'pdf';
      page: number;
      rect: { x: number; y: number; w: number; h: number }; // normalized (0..1) on rendered page
      color: HighlightColor;
      createdAt: number;
    };
