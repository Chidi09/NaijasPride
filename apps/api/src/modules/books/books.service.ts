import { Prisma, PrismaClient } from "@prisma/client";
import { Book, PaginationMeta } from "@naijaspride/types";

type BookSearchParams = {
  page?: number;
  limit?: number;
  q?: string;
  kind?: "book" | "comic";
};

type LightNovelSearchParams = {
  page?: number;
  limit?: number;
  q?: string;
};

export type LightNovelVolumeSummary = Pick<
  Book,
  | "id"
  | "title"
  | "slug"
  | "author"
  | "year"
  | "coverUrl"
  | "format"
  | "downloadUrl"
  | "fileSize"
  | "publisher"
  | "viewCount"
  | "description"
  | "createdAt"
  | "updatedAt"
> & {
  volumeNumber: number | null;
};

export type LightNovelSeriesSummary = {
  seriesKey: string;
  seriesTitle: string;
  totalVolumes: number;
  latestYear: number;
  coverUrl: string | null;
  volumes: LightNovelVolumeSummary[];
};

export type LightNovelSeriesDetail = LightNovelSeriesSummary & {
  currentSlug: string;
};

type CreateBookInput = {
  title: string;
  year: number;
  author: string;
  description?: string;
  isbn?: string;
  coverUrl?: string;
  downloadUrl?: string;
  fileSize?: number;
  format?: string;
  genre?: string[];
  language?: string;
  pageCount?: number;
  rating?: number;
  publisher?: string;
};

const cleanWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const normalizeKey = (value: string): string =>
  cleanWhitespace(value)
    .toLowerCase()
    .replace(/[._]/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const parseSeriesFromDescription = (
  description: string | null | undefined,
): string | null => {
  if (!description) return null;
  const match = description.match(/(?:^|\n)\s*series\s*:\s*([^\n]+)/i);
  const value = match?.[1] ? cleanWhitespace(match[1]) : "";
  return value || null;
};

const parseVolumeFromDescription = (
  description: string | null | undefined,
): number | null => {
  if (!description) return null;
  const match = description.match(/(?:^|\n)\s*volume\s*:\s*(\d{1,4})\b/i);
  if (!match?.[1]) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseVolumeFromTitle = (title: string): number | null => {
  const patterns = [
    /\bvol(?:ume)?\.?\s*(\d{1,4})\b/i,
    /\bv\.?\s*(\d{1,4})\b/i,
    /\bpart\s*(\d{1,4})\b/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (!match?.[1]) continue;
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

const stripVolumeSuffix = (title: string): string =>
  cleanWhitespace(
    title
      .replace(/\bvol(?:ume)?\.?\s*\d{1,4}\b/gi, " ")
      .replace(/\bv\.?\s*\d{1,4}\b/gi, " ")
      .replace(/\bpart\s*\d{1,4}\b/gi, " ")
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/\([^\)]*\)/g, " "),
  );

const parseSeriesFromSlug = (slug: string): string | null => {
  const match = slug.match(/^elsci-ln-([a-z0-9-]+)-[a-f0-9]{10}$/i);
  if (!match?.[1]) return null;
  return cleanWhitespace(match[1].replace(/-/g, " "));
};

const normalizeCoverUrl = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^http:\/\//i, "https://");
};

const pickLatestSeriesCover = (
  volumes: LightNovelVolumeSummary[],
): string | null => {
  if (volumes.length === 0) return null;

  const sorted = [...volumes].sort((a, b) => {
    const av = a.volumeNumber ?? -1;
    const bv = b.volumeNumber ?? -1;
    if (av !== bv) return bv - av;
    if (a.year !== b.year) return b.year - a.year;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  for (const volume of sorted) {
    if (volume.coverUrl) return volume.coverUrl;
  }

  return null;
};

const isLikelyLightNovel = (book: {
  genre: string[];
  publisher: string | null;
  slug: string;
}): boolean => {
  if (book.genre.some((entry) => entry.toLowerCase() === "light novel"))
    return true;
  if ((book.publisher || "").toLowerCase().includes("elsci")) return true;
  return book.slug.toLowerCase().startsWith("elsci-ln-");
};

export class BooksService {
  constructor(private prisma: PrismaClient) {}

  private deriveLightNovelMeta(book: {
    title: string;
    slug: string;
    description: string | null;
  }): { seriesTitle: string; seriesKey: string; volumeNumber: number | null } {
    const seriesFromDescription = parseSeriesFromDescription(book.description);
    const seriesFromSlug = parseSeriesFromSlug(book.slug);
    const seriesFromTitle = stripVolumeSuffix(book.title);
    const seriesTitle =
      cleanWhitespace(
        seriesFromDescription ||
          seriesFromSlug ||
          seriesFromTitle ||
          book.title,
      ) || cleanWhitespace(book.title);

    const volumeFromDescription = parseVolumeFromDescription(book.description);
    const volumeFromTitle = parseVolumeFromTitle(book.title);
    const volumeNumber = volumeFromDescription ?? volumeFromTitle;

    return {
      seriesTitle,
      seriesKey: normalizeKey(seriesTitle),
      volumeNumber,
    };
  }

  // Legacy Elsci proxy URLs point to a disabled endpoint — null them out so the
  // frontend never tries to fetch a path that always returns 404.
  private static sanitizeElsciDownloadUrl(
    downloadUrl: string | null,
  ): string | null {
    if (!downloadUrl) return null;
    if (downloadUrl.includes("/books/external/elsci/file")) return null;
    return downloadUrl;
  }

  private toLightNovelVolumeSummary(book: {
    id: string;
    title: string;
    slug: string;
    author: string;
    year: number;
    coverUrl: string | null;
    format: string;
    downloadUrl: string | null;
    fileSize: number | null;
    publisher: string | null;
    viewCount: number;
    createdAt: Date;
    updatedAt: Date;
    description: string | null;
  }): LightNovelVolumeSummary {
    const meta = this.deriveLightNovelMeta(book);

    return {
      id: book.id,
      title: book.title,
      slug: book.slug,
      author: book.author,
      year: book.year,
      coverUrl: normalizeCoverUrl(book.coverUrl),
      format: book.format,
      downloadUrl: BooksService.sanitizeElsciDownloadUrl(book.downloadUrl),
      fileSize: book.fileSize,
      publisher: book.publisher,
      viewCount: book.viewCount,
      description: book.description,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
      volumeNumber: meta.volumeNumber,
    };
  }

  async listLightNovelSeries(
    params: LightNovelSearchParams,
  ): Promise<{ data: LightNovelSeriesSummary[]; meta: PaginationMeta }> {
    const { page = 1, limit = 20, q } = params;

    const books = await this.prisma.book.findMany({
      where: {
        status: "active",
        downloadUrl: { startsWith: "/api/v1/books/download" },
        AND: [
          {
            OR: [
              { genre: { has: "Light Novel" } },
              {
                publisher: {
                  contains: "elsci",
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              { slug: { startsWith: "elsci-ln-" } },
            ],
          },
          ...(q
            ? [
                {
                  OR: [
                    {
                      title: {
                        contains: q,
                        mode: Prisma.QueryMode.insensitive,
                      },
                    },
                    {
                      author: {
                        contains: q,
                        mode: Prisma.QueryMode.insensitive,
                      },
                    },
                    {
                      description: {
                        contains: q,
                        mode: Prisma.QueryMode.insensitive,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 4000,
    });

    const grouped = new Map<
      string,
      {
        seriesTitle: string;
        coverUrl: string | null;
        latestYear: number;
        latestUpdatedAt: number;
        volumes: LightNovelVolumeSummary[];
      }
    >();

    for (const book of books) {
      if (!isLikelyLightNovel(book)) continue;
      const meta = this.deriveLightNovelMeta(book);
      if (!meta.seriesKey) continue;

      const volume = this.toLightNovelVolumeSummary(book);
      const existing = grouped.get(meta.seriesKey);

      if (!existing) {
        grouped.set(meta.seriesKey, {
          seriesTitle: meta.seriesTitle,
          coverUrl: normalizeCoverUrl(book.coverUrl),
          latestYear: book.year,
          latestUpdatedAt: book.updatedAt.getTime(),
          volumes: [volume],
        });
        continue;
      }

      existing.volumes.push(volume);
      if (!existing.coverUrl && book.coverUrl)
        existing.coverUrl = normalizeCoverUrl(book.coverUrl);
      if (book.year > existing.latestYear) existing.latestYear = book.year;
      if (book.updatedAt.getTime() > existing.latestUpdatedAt) {
        existing.latestUpdatedAt = book.updatedAt.getTime();
      }
    }

    const seriesList: Array<
      LightNovelSeriesSummary & { latestUpdatedAt: number }
    > = Array.from(grouped.entries()).map(([seriesKey, entry]) => {
      const sortedVolumes = [...entry.volumes].sort((a, b) => {
        const av = a.volumeNumber ?? Number.MAX_SAFE_INTEGER;
        const bv = b.volumeNumber ?? Number.MAX_SAFE_INTEGER;
        if (av !== bv) return av - bv;
        if (a.year !== b.year) return a.year - b.year;
        return a.title.localeCompare(b.title);
      });

      return {
        seriesKey,
        seriesTitle: entry.seriesTitle,
        totalVolumes: sortedVolumes.length,
        latestYear: entry.latestYear,
        coverUrl:
          pickLatestSeriesCover(sortedVolumes) || entry.coverUrl || null,
        volumes: sortedVolumes,
        latestUpdatedAt: entry.latestUpdatedAt,
      };
    });

    seriesList.sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);

    const total = seriesList.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paged = seriesList
      .slice(start, end)
      .map(({ latestUpdatedAt: _drop, ...rest }) => rest);

    return {
      data: paged,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async getLightNovelSeriesBySlug(
    slug: string,
  ): Promise<LightNovelSeriesDetail | null> {
    const current = await this.prisma.book.findFirst({
      where: {
        slug,
        status: "active",
        downloadUrl: { startsWith: "/api/v1/books/download" },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        author: true,
        year: true,
        coverUrl: true,
        format: true,
        downloadUrl: true,
        fileSize: true,
        publisher: true,
        createdAt: true,
        updatedAt: true,
        description: true,
        genre: true,
      },
    });

    if (!current || !isLikelyLightNovel(current)) return null;

    const targetMeta = this.deriveLightNovelMeta(current);
    if (!targetMeta.seriesKey) return null;

    const candidates = await this.prisma.book.findMany({
      where: {
        status: "active",
        downloadUrl: { startsWith: "/api/v1/books/download" },
        OR: [
          { genre: { has: "Light Novel" } },
          {
            publisher: {
              contains: "elsci",
              mode: Prisma.QueryMode.insensitive,
            },
          },
          { slug: { startsWith: "elsci-ln-" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 4000,
    });

    const sameSeries = candidates
      .filter((book) => isLikelyLightNovel(book))
      .filter(
        (book) =>
          this.deriveLightNovelMeta(book).seriesKey === targetMeta.seriesKey,
      )
      .map((book) => this.toLightNovelVolumeSummary(book));

    if (sameSeries.length === 0) return null;

    sameSeries.sort((a, b) => {
      const av = a.volumeNumber ?? Number.MAX_SAFE_INTEGER;
      const bv = b.volumeNumber ?? Number.MAX_SAFE_INTEGER;
      if (av !== bv) return av - bv;
      if (a.year !== b.year) return a.year - b.year;
      return a.title.localeCompare(b.title);
    });

    const latestYear = sameSeries.reduce(
      (acc, item) => Math.max(acc, item.year),
      0,
    );
    const coverUrl =
      sameSeries.find((item) => !!item.coverUrl)?.coverUrl || null;

    return {
      seriesKey: targetMeta.seriesKey,
      seriesTitle: targetMeta.seriesTitle,
      totalVolumes: sameSeries.length,
      latestYear,
      coverUrl,
      volumes: sameSeries,
      currentSlug: slug,
    };
  }

  async search(
    params: BookSearchParams,
  ): Promise<{ data: Book[]; meta: PaginationMeta }> {
    const { page = 1, limit = 20, q, kind } = params;
    const skip = (page - 1) * limit;

    const filters: Prisma.BookWhereInput[] = [];

    if (q) {
      filters.push({
        OR: [
          { title: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { author: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }

    if (kind === "comic") {
      filters.push({ genre: { has: "Comic" } });
    } else if (kind === "book") {
      filters.push({
        AND: [
          { NOT: { genre: { has: "Comic" } } },
          {
            NOT: {
              OR: [
                { genre: { has: "Light Novel" } },
                {
                  publisher: {
                    contains: "elsci",
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                { slug: { startsWith: "elsci-ln-" } },
              ],
            },
          },
        ],
      });
    }

    // Frontend should only surface files mirrored to our storage-backed download endpoint.
    filters.push({
      downloadUrl: { startsWith: "/api/v1/books/download" },
    });

    const where: Prisma.BookWhereInput = {
      status: "active",
      AND: filters,
    };

    const [total, books] = await Promise.all([
      this.prisma.book.count({ where }),
      this.prisma.book.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      data: books.map((book) => ({
        ...book,
        coverUrl: normalizeCoverUrl(book.coverUrl),
        createdAt: book.createdAt.toISOString(),
        updatedAt: book.updatedAt.toISOString(),
      })) as Book[],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findBySlug(slug: string): Promise<Book | null> {
    const book = await this.prisma.book.findFirst({
      where: { slug, status: "active" },
    });
    if (!book) return null;
    return {
      ...book,
      coverUrl: normalizeCoverUrl(book.coverUrl),
      downloadUrl: BooksService.sanitizeElsciDownloadUrl(book.downloadUrl),
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    } as Book;
  }

  async create(data: CreateBookInput): Promise<Book> {
    const book = await this.prisma.book.create({
      data: {
        ...data,
        slug: this.generateSlug(data.title, data.year),
      },
    });
    return {
      ...book,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    } as Book;
  }

  private generateSlug(title: string, year: number): string {
    return `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${year}`;
  }

  async isFavorite(userId: string, bookId: string) {
    const count = await this.prisma.bookFavorite.count({
      where: { userId, bookId },
    });
    return count > 0;
  }

  async getUserFavorites(userId: string) {
    return this.prisma.bookFavorite.findMany({
      where: { userId },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            slug: true,
            author: true,
            coverUrl: true,
            format: true,
            pageCount: true,
            genre: true,
            year: true,
          },
        },
      },
      orderBy: { addedAt: "desc" },
    });
  }

  async addFavorite(userId: string, bookId: string) {
    return this.prisma.bookFavorite.upsert({
      where: { userId_bookId: { userId, bookId } },
      update: { addedAt: new Date() },
      create: { userId, bookId },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            slug: true,
            author: true,
            coverUrl: true,
            format: true,
            pageCount: true,
            genre: true,
            year: true,
          },
        },
      },
    });
  }

  async removeFavorite(userId: string, bookId: string) {
    return this.prisma.bookFavorite.deleteMany({
      where: { userId, bookId },
    });
  }
}
