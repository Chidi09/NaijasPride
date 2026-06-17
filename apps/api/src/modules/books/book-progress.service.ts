import { PrismaClient } from "@prisma/client";
import { NotFoundError } from "../../shared/errors/app-error";

type RecentProgressRow = {
  bookId: string;
  title: string;
  author: string | null;
  slug: string;
  coverUrl: string | null;
  page: number;
  pageCount: number | null;
  progressPercentage: number | null;
  updatedAt: string;
};

type ProgressResult = {
  page: number;
  updatedAt: string;
} | null;

type UpsertProgressResult = {
  page: number;
  updatedAt: string;
};

export class BookProgressService {
  constructor(private readonly prisma: PrismaClient) {}

  async listRecent(
    userId: string,
    limit: number,
  ): Promise<RecentProgressRow[]> {
    const take = Math.min(20, Math.max(1, limit));

    const rows = await this.prisma.bookProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take,
      include: {
        book: {
          select: {
            id: true,
            title: true,
            author: true,
            slug: true,
            coverUrl: true,
            pageCount: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      bookId: row.bookId,
      title: row.book.title,
      author: row.book.author,
      slug: row.book.slug,
      coverUrl: row.book.coverUrl,
      page: row.page,
      pageCount: row.book.pageCount,
      progressPercentage:
        row.book.pageCount && row.book.pageCount > 0
          ? Math.min(100, Math.round((row.page / row.book.pageCount) * 100))
          : null,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getProgress(userId: string, slug: string): Promise<ProgressResult> {
    const book = await this.prisma.book.findUnique({ where: { slug } });
    if (!book) {
      throw new NotFoundError("Book");
    }

    const progress = await this.prisma.bookProgress.findUnique({
      where: { userId_bookId: { userId, bookId: book.id } },
    });

    if (!progress) return null;

    return {
      page: progress.page,
      updatedAt: progress.updatedAt.toISOString(),
    };
  }

  async upsertProgress(
    userId: string,
    slug: string,
    page: number,
  ): Promise<UpsertProgressResult> {
    const book = await this.prisma.book.findUnique({ where: { slug } });
    if (!book) {
      throw new NotFoundError("Book");
    }

    const progress = await this.prisma.bookProgress.upsert({
      where: { userId_bookId: { userId, bookId: book.id } },
      update: { page },
      create: { userId, bookId: book.id, page },
    });

    return {
      page: progress.page,
      updatedAt: progress.updatedAt.toISOString(),
    };
  }
}
