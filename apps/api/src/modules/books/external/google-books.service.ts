import axios from "axios";

const GOOGLE_BOOKS_API_BASE = "https://www.googleapis.com/books/v1/volumes";

/** Google Books API returns http:// URLs — upgrade to https to avoid mixed content. */
function httpsUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//, "https://");
}

export interface GoogleBooksVolume {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
    pageCount?: number;
    categories?: string[];
    publisher?: string;
    imageLinks?: {
      smallThumbnail?: string;
      thumbnail?: string;
      small?: string;
      medium?: string;
      large?: string;
      extraLarge?: string;
    };
    language?: string;
  };
}

export interface GoogleBooksSearchResult {
  items?: GoogleBooksVolume[];
  totalItems: number;
}

/**
 * Search for a book on Google Books API and return the best cover image URL
 */
export async function fetchGoogleBooksCover(
  title: string,
  author?: string,
  year?: number,
): Promise<string | null> {
  try {
    // Build search query
    let query = `intitle:${encodeURIComponent(title)}`;
    if (author) {
      query += `+inauthor:${encodeURIComponent(author)}`;
    }

    const response = await axios.get<GoogleBooksSearchResult>(
      `${GOOGLE_BOOKS_API_BASE}?q=${query}&maxResults=5`,
      { timeout: 10000 },
    );

    if (!response.data.items || response.data.items.length === 0) {
      return null;
    }

    // Find the best matching result
    let bestMatch: GoogleBooksVolume | null = null;
    let bestScore = 0;

    for (const item of response.data.items) {
      const info = item.volumeInfo;
      let score = 0;

      // Exact title match gets highest score
      const itemTitle = (info.title || "").toLowerCase().trim();
      const searchTitle = title.toLowerCase().trim();
      if (itemTitle === searchTitle) {
        score += 100;
      } else if (
        itemTitle.includes(searchTitle) ||
        searchTitle.includes(itemTitle)
      ) {
        score += 50;
      }

      // Author match
      if (author && info.authors) {
        const authorMatch = info.authors.some(
          (a) =>
            a.toLowerCase().includes(author.toLowerCase()) ||
            author.toLowerCase().includes(a.toLowerCase()),
        );
        if (authorMatch) {
          score += 30;
        }
      }

      // Year match
      if (year && info.publishedDate) {
        const pubYear = Number.parseInt(info.publishedDate.substring(0, 4), 10);
        if (Number.isFinite(pubYear) && Math.abs(pubYear - year) <= 1) {
          score += 20;
        }
      }

      // Prefer results with cover images
      if (info.imageLinks?.thumbnail) {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    if (!bestMatch) {
      // Fall back to first result if no good match
      bestMatch = response.data.items[0];
    }

    // Get the best available image
    const imageLinks = bestMatch.volumeInfo.imageLinks;
    if (!imageLinks) {
      return null;
    }

    // Prefer larger images, fallback to smaller ones
    const coverUrl =
      imageLinks.extraLarge ||
      imageLinks.large ||
      imageLinks.medium ||
      imageLinks.small ||
      imageLinks.thumbnail ||
      imageLinks.smallThumbnail;

    return httpsUrl(coverUrl);
  } catch (error) {
    console.error("[GoogleBooks] Failed to fetch cover:", error);
    return null;
  }
}

/**
 * Enrich book metadata from Google Books.
 * Returns author (first listed), coverUrl, description, pageCount, and categories.
 */
export async function enrichBookFromGoogleBooks(
  title: string,
  author?: string,
  year?: number,
): Promise<{
  author: string | null;
  coverUrl: string | null;
  description: string | null;
  pageCount: number | null;
  categories: string[] | null;
  publishedYear: number | null;
  publisher: string | null;
  language: string | null;
}> {
  const empty = {
    author: null,
    coverUrl: null,
    description: null,
    pageCount: null,
    categories: null,
    publishedYear: null,
    publisher: null,
    language: null,
  };
  try {
    let query = `intitle:${encodeURIComponent(title)}`;
    if (author) {
      query += `+inauthor:${encodeURIComponent(author)}`;
    }

    const response = await axios.get<GoogleBooksSearchResult>(
      `${GOOGLE_BOOKS_API_BASE}?q=${query}&maxResults=5`,
      { timeout: 10000 },
    );

    if (!response.data.items || response.data.items.length === 0) {
      return empty;
    }

    // Score results: prefer title match + author match + has cover
    let bestMatch = response.data.items[0]!;
    let bestScore = 0;
    const searchTitle = title.toLowerCase().trim();

    for (const item of response.data.items) {
      const info = item.volumeInfo;
      let score = 0;
      const itemTitle = (info.title || "").toLowerCase().trim();

      if (itemTitle === searchTitle) score += 100;
      else if (
        itemTitle.includes(searchTitle) ||
        searchTitle.includes(itemTitle)
      )
        score += 50;

      if (author && info.authors) {
        const match = info.authors.some(
          (a) =>
            a.toLowerCase().includes(author.toLowerCase()) ||
            author.toLowerCase().includes(a.toLowerCase()),
        );
        if (match) score += 30;
      }

      if (year && info.publishedDate) {
        const pubYear = Number.parseInt(info.publishedDate.substring(0, 4), 10);
        if (Number.isFinite(pubYear) && Math.abs(pubYear - year) <= 1)
          score += 20;
      }

      if (info.imageLinks?.thumbnail) score += 10;
      if (info.authors?.length) score += 5;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    const info = bestMatch.volumeInfo;

    const imageLinks = info.imageLinks;
    const coverUrl =
      imageLinks?.extraLarge ||
      imageLinks?.large ||
      imageLinks?.medium ||
      imageLinks?.small ||
      imageLinks?.thumbnail ||
      imageLinks?.smallThumbnail ||
      null;

    return {
      author: info.authors?.[0] || null,
      coverUrl: httpsUrl(coverUrl),
      description: info.description || null,
      pageCount: info.pageCount || null,
      categories: info.categories || null,
      publishedYear: info.publishedDate
        ? Number.parseInt(info.publishedDate.substring(0, 4), 10) || null
        : null,
      publisher: info.publisher || null,
      language: info.language || null,
    };
  } catch (error) {
    console.error("[GoogleBooks] Failed to enrich book:", error);
    return empty;
  }
}
