import { Prisma, PrismaClient } from "@prisma/client";
import { NotFoundError } from "../../shared/errors/app-error";

type HighlightPayload = {
  id?: string;
  kind: "epub" | "pdf";
  color: string;
  cfiRange?: string;
  excerpt?: string;
  page?: number;
  rect?: { x: number; y: number; w: number; h: number };
  createdAt?: number;
};

type HighlightResult = {
  id: string;
  kind: string;
  color: string;
  cfiRange: string | null;
  excerpt: string | null;
  page: number | null;
  rect: unknown;
  createdAt: string;
  updatedAt: string;
};

export class BookHighlightService {
  constructor(private readonly prisma: PrismaClient) {}

  async listHighlights(
    userId: string,
    slug: string,
  ): Promise<HighlightResult[]> {
    const book = await this.prisma.book.findUnique({ where: { slug } });
    if (!book) {
      throw new NotFoundError("Book");
    }

    const highlights = await this.prisma.bookHighlight.findMany({
      where: { userId, bookId: book.id },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    return highlights.map((h) => ({
      id: h.id,
      kind: h.kind,
      color: h.color,
      cfiRange: h.cfiRange,
      excerpt: h.excerpt,
      page: h.page,
      rect: h.rect,
      createdAt: h.createdAt.toISOString(),
      updatedAt: h.updatedAt.toISOString(),
    }));
  }

  async createHighlight(
    userId: string,
    slug: string,
    payload: HighlightPayload,
  ): Promise<HighlightResult> {
    const book = await this.prisma.book.findUnique({ where: { slug } });
    if (!book) {
      throw new NotFoundError("Book");
    }

    const createdAt =
      typeof payload.createdAt === "number" &&
      Number.isFinite(payload.createdAt) &&
      payload.createdAt > 0
        ? new Date(payload.createdAt)
        : undefined;

    const highlight = await this.prisma.bookHighlight.create({
      data: {
        id: payload.id,
        userId,
        bookId: book.id,
        kind: payload.kind,
        color: payload.color,
        cfiRange: payload.kind === "epub" ? payload.cfiRange : null,
        excerpt: payload.kind === "epub" ? (payload.excerpt ?? null) : null,
        page: payload.kind === "pdf" ? (payload.page ?? null) : null,
        rect:
          payload.kind === "pdf"
            ? (payload.rect ?? Prisma.JsonNull)
            : Prisma.JsonNull,
        ...(createdAt ? { createdAt } : {}),
      },
    });

    return {
      id: highlight.id,
      kind: highlight.kind,
      color: highlight.color,
      cfiRange: highlight.cfiRange,
      excerpt: highlight.excerpt,
      page: highlight.page,
      rect: highlight.rect,
      createdAt: highlight.createdAt.toISOString(),
      updatedAt: highlight.updatedAt.toISOString(),
    };
  }

  async deleteHighlight(
    userId: string,
    slug: string,
    highlightId: string,
  ): Promise<{ id: string }> {
    const book = await this.prisma.book.findUnique({ where: { slug } });
    if (!book) {
      throw new NotFoundError("Book");
    }

    const found = await this.prisma.bookHighlight.findFirst({
      where: { id: highlightId, userId, bookId: book.id },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundError("Highlight");
    }

    await this.prisma.bookHighlight.delete({ where: { id: highlightId } });
    return { id: highlightId };
  }

  async deleteAllHighlights(
    userId: string,
    slug: string,
  ): Promise<{ cleared: boolean }> {
    const book = await this.prisma.book.findUnique({ where: { slug } });
    if (!book) {
      throw new NotFoundError("Book");
    }

    await this.prisma.bookHighlight.deleteMany({
      where: { userId, bookId: book.id },
    });

    return { cleared: true };
  }
}
