export type MangaTag = {
  id: string;
  name: string;
  group: string | null;
};

export type MangaSearchFilters = {
  tags?: string[];
  status?: string[];
  originalLanguage?: string[];
  contentRating?: string[];
  demographic?: string[];
  sort?: 'relevance' | 'latestUploadedChapter' | 'followedCount' | 'createdAt' | 'year';
  year?: number;
};

export type MangaSummary = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  status: string | null;
  year: number | null;
  originalLanguage: string | null;
  tags: string[];
  latestChapter: string | null;
};

export type MangaDetail = MangaSummary & {
  author: string | null;
  artist: string | null;
  contentRating: string | null;
  publicationDemographic: string | null;
  availableTranslatedLanguages: string[];
};

export type MangaChapter = {
  id: string;
  chapter: string | null;
  volume: string | null;
  title: string | null;
  pages: number;
  publishedAt: string | null;
  readableAt: string | null;
  translatedLanguage: string | null;
  scanlationGroup: string | null;
  externalUrl: string | null;
  isExternal: boolean;
};

export type MangaPagesResult = {
  chapterId: string;
  readerMode: 'webtoon' | 'manga' | 'comic';
  pages: string[];
  externalUrl: string | null;
  isExternal: boolean;
};

export type MangaDiscoverResult = {
  trending: MangaSummary[];
  recentlyUpdated: MangaSummary[];
  newTitles: MangaSummary[];
};

export type MangaSourceCapabilities = {
  supportsFilters: boolean;
  supportsLanguages: boolean;
  supportsSimilar: boolean;
  supportsDiscover: boolean;
  supportsTags: boolean;
  supportsExternalRedirect: boolean;
  needsAntiBot: boolean;
};

export interface MangaSource {
  id: string;
  displayName: string;
  capabilities: MangaSourceCapabilities;

  searchManga(query?: string, limit?: number, filters?: MangaSearchFilters): Promise<MangaSummary[]>;
  getDiscoverManga(limit?: number): Promise<MangaDiscoverResult>;
  getMangaTags(): Promise<MangaTag[]>;
  getMangaDetail(mangaId: string): Promise<MangaDetail | null>;
  getSimilarManga(mangaId: string, limit?: number): Promise<MangaSummary[]>;
  getChapters(mangaId: string, translatedLanguage?: string, limit?: number): Promise<MangaChapter[]>;
  getChapterPages(chapterId: string): Promise<MangaPagesResult>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;
}
