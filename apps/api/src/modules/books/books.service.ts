import { Prisma, PrismaClient } from '@prisma/client';
import { Book, PaginationMeta } from '@naijaspride/types';

type BookSearchParams = {
  page?: number;
  limit?: number;
  q?: string;
  kind?: 'book' | 'comic';
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

export class BooksService {
  constructor(private prisma: PrismaClient) {}

  async search(params: BookSearchParams): Promise<{ data: Book[]; meta: PaginationMeta }> {
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

    if (kind === 'comic') {
      filters.push({ genre: { has: 'Comic' } });
    } else if (kind === 'book') {
      filters.push({ NOT: { genre: { has: 'Comic' } } });
    }

    const where: Prisma.BookWhereInput = {
      status: 'active',
      ...(filters.length > 0 ? { AND: filters } : {}),
    };

    const [total, books] = await Promise.all([
      this.prisma.book.count({ where }),
      this.prisma.book.findMany({ 
        where, 
        skip, 
        take: limit,
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return {
      data: books.map((book) => ({
        ...book,
        createdAt: book.createdAt.toISOString(),
        updatedAt: book.updatedAt.toISOString(),
      })) as Book[],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  async findBySlug(slug: string): Promise<Book | null> {
    const book = await this.prisma.book.findFirst({
      where: { slug, status: 'active' },
    });
    if (!book) return null;
    return {
      ...book,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    } as Book;
  }

  async create(data: CreateBookInput): Promise<Book> {
    const book = await this.prisma.book.create({
      data: {
        ...data,
        slug: this.generateSlug(data.title, data.year)
      }
    });
    return {
      ...book,
      createdAt: book.createdAt.toISOString(),
      updatedAt: book.updatedAt.toISOString(),
    } as Book;
  }

  private generateSlug(title: string, year: number): string {
    return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}`;
  }
}
