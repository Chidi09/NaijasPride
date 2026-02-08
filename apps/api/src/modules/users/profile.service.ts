import { PrismaClient } from "@prisma/client";

export class ProfileService {
  constructor(private prisma: PrismaClient) {}

  async getProfile(
    userId: string,
    pagination: {
      watchlistPage?: number;
      watchlistPageSize?: number;
      downloadPage?: number;
      downloadPageSize?: number;
    } = {},
  ) {
    const watchlistPage = Math.max(1, pagination.watchlistPage ?? 1);
    const watchlistPageSize = Math.min(
      50,
      Math.max(1, pagination.watchlistPageSize ?? 20),
    );
    const downloadPage = Math.max(1, pagination.downloadPage ?? 1);
    const downloadPageSize = Math.min(
      50,
      Math.max(1, pagination.downloadPageSize ?? 10),
    );

    const [user, counts] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          watchlist: {
            skip: (watchlistPage - 1) * watchlistPageSize,
            take: watchlistPageSize,
          },
          downloadHistory: {
            include: { movie: true },
            orderBy: { timestamp: "desc" },
            skip: (downloadPage - 1) * downloadPageSize,
            take: downloadPageSize,
          },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          _count: {
            select: {
              watchlist: true,
              downloadHistory: true,
            },
          },
        },
      }),
    ]);

    if (!user) throw new Error("User not found");

    // Basic Recommendation Logic: Get genre of last download
    let recommendations: Awaited<
      ReturnType<PrismaClient["movie"]["findMany"]>
    > = [];
    const latestDownload =
      downloadPage === 1
        ? user.downloadHistory[0]
        : await this.prisma.download.findFirst({
            where: { userId },
            include: { movie: true },
            orderBy: { timestamp: "desc" },
          });

    if (latestDownload?.movie) {
      const lastGenre = latestDownload.movie.genre[0];
      recommendations = await this.prisma.movie.findMany({
        where: {
          genre: { has: lastGenre },
          id: {
            notIn: user.downloadHistory.map(
              (d: { movieId: string }) => d.movieId,
            ),
          },
        },
        take: 5,
      });
    }

    const watchlistTotal = counts?._count.watchlist ?? 0;
    const downloadHistoryTotal = counts?._count.downloadHistory ?? 0;
    const buildMeta = (page: number, limit: number, total: number) => ({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    });

    return {
      ...user,
      recommendations,
      watchlistMeta: buildMeta(
        watchlistPage,
        watchlistPageSize,
        watchlistTotal,
      ),
      downloadHistoryMeta: buildMeta(
        downloadPage,
        downloadPageSize,
        downloadHistoryTotal,
      ),
    };
  }

  async toggleWatchlist(userId: string, movieId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { watchlist: { where: { id: movieId } } },
    });

    if (user?.watchlist.length) {
      // Remove
      await this.prisma.user.update({
        where: { id: userId },
        data: { watchlist: { disconnect: { id: movieId } } },
      });
      return { added: false };
    } else {
      // Add
      await this.prisma.user.update({
        where: { id: userId },
        data: { watchlist: { connect: { id: movieId } } },
      });
      return { added: true };
    }
  }
}
