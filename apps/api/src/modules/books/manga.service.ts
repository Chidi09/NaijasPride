import axios from 'axios';

type MangaDexSearchItem = {
  id: string;
  type: string;
  attributes?: {
    title?: Record<string, string>;
    description?: Record<string, string>;
    status?: string;
    year?: number;
    originalLanguage?: string;
    tags?: Array<{
      attributes?: {
        name?: Record<string, string>;
      };
    }>;
  };
  relationships?: Array<{
    type?: string;
    attributes?: {
      fileName?: string;
    };
  }>;
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
};

export type MangaChapter = {
  id: string;
  chapter: string | null;
  volume: string | null;
  title: string | null;
  pages: number;
  publishedAt: string | null;
};

export type MangaPagesResult = {
  chapterId: string;
  readerMode: 'webtoon' | 'manga' | 'comic';
  pages: string[];
};

const MANGADEX_BASE_URL = 'https://api.mangadex.org';
const MANGADEX_COVER_URL = 'https://uploads.mangadex.org/covers';

const pickLocalized = (field?: Record<string, string>) => {
  if (!field) return '';
  return field.en || field['en-us'] || Object.values(field)[0] || '';
};

const extractTags = (item: MangaDexSearchItem): string[] => {
  return (
    item.attributes?.tags
      ?.map((tag) => pickLocalized(tag.attributes?.name))
      .filter(Boolean) || []
  );
};

const detectReaderMode = (manga: MangaDexSearchItem | null): 'webtoon' | 'manga' | 'comic' => {
  if (!manga) return 'manga';

  const tags = extractTags(manga).map((t) => t.toLowerCase());
  const title = pickLocalized(manga.attributes?.title).toLowerCase();
  const description = pickLocalized(manga.attributes?.description).toLowerCase();
  const originalLanguage = (manga.attributes?.originalLanguage || '').toLowerCase();

  if (
    tags.includes('long strip') ||
    title.includes('webtoon') ||
    description.includes('webtoon') ||
    description.includes('manhwa')
  ) {
    return 'webtoon';
  }

  if (originalLanguage === 'en' || tags.includes('full color')) {
    return 'comic';
  }

  return 'manga';
};

export class MangaService {
  async searchManga(query: string, limit = 20): Promise<MangaSummary[]> {
    if (!query.trim()) return [];

    try {
      const response = await axios.get(`${MANGADEX_BASE_URL}/manga`, {
        params: {
          title: query,
          limit,
          'order[relevance]': 'desc',
          'contentRating[]': ['safe', 'suggestive', 'erotica'],
          'includes[]': 'cover_art',
        },
      });

      const items = (response.data?.data || []) as MangaDexSearchItem[];
      return items.map((manga) => {
        const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
        const fileName = coverRel?.attributes?.fileName;
        return {
          id: manga.id,
          title: pickLocalized(manga.attributes?.title),
          description: pickLocalized(manga.attributes?.description),
          coverUrl: fileName ? `${MANGADEX_COVER_URL}/${manga.id}/${fileName}` : null,
          status: manga.attributes?.status || null,
          year: manga.attributes?.year || null,
          originalLanguage: manga.attributes?.originalLanguage || null,
          tags: extractTags(manga),
        };
      });
    } catch (error) {
      console.error('[MangaDex] search failed:', error);
      return [];
    }
  }

  async getChapters(mangaId: string, translatedLanguage = 'en', limit = 100): Promise<MangaChapter[]> {
    try {
      const response = await axios.get(`${MANGADEX_BASE_URL}/manga/${mangaId}/feed`, {
        params: {
          translatedLanguage: [translatedLanguage],
          order: { chapter: 'desc' },
          limit,
        },
      });

      return (response.data?.data || []).map((chapter: any) => ({
        id: chapter.id,
        chapter: chapter.attributes?.chapter || null,
        volume: chapter.attributes?.volume || null,
        title: chapter.attributes?.title || null,
        pages: chapter.attributes?.pages || 0,
        publishedAt: chapter.attributes?.publishAt || null,
      }));
    } catch (error) {
      console.error('[MangaDex] chapter fetch failed:', error);
      return [];
    }
  }

  async getChapterPages(chapterId: string): Promise<MangaPagesResult> {
    try {
      const [atHome, chapterMeta] = await Promise.all([
        axios.get(`${MANGADEX_BASE_URL}/at-home/server/${chapterId}`),
        axios.get(`${MANGADEX_BASE_URL}/chapter/${chapterId}`, {
          params: { 'includes[]': 'manga' },
        }),
      ]);

      const baseUrl = atHome.data?.baseUrl;
      const hash = atHome.data?.chapter?.hash;
      const files = atHome.data?.chapter?.data || [];
      const dataSaverFiles = atHome.data?.chapter?.dataSaver || [];

      const mangaRel = (chapterMeta.data?.data?.relationships || []).find((r: any) => r.type === 'manga');
      const mangaId = mangaRel?.id;

      let mangaData: MangaDexSearchItem | null = null;
      if (mangaId) {
        try {
          const mangaResponse = await axios.get(`${MANGADEX_BASE_URL}/manga/${mangaId}`);
          mangaData = mangaResponse.data?.data as MangaDexSearchItem;
        } catch {
          mangaData = null;
        }
      }

      const readerMode = detectReaderMode(mangaData);
      const selectedFiles = readerMode === 'webtoon' && dataSaverFiles.length > 0 ? dataSaverFiles : files;
      const qualityPath = selectedFiles === dataSaverFiles ? 'data-saver' : 'data';

      return {
        chapterId,
        readerMode,
        pages: selectedFiles.map((file: string) => `${baseUrl}/${qualityPath}/${hash}/${file}`),
      };
    } catch (error) {
      console.error('[MangaDex] page fetch failed:', error);
      return {
        chapterId,
        readerMode: 'manga',
        pages: [],
      };
    }
  }
}
