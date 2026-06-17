import { Prisma, PrismaClient, Genre as PrismaGenre } from "@prisma/client";
import {
  ContentStatus,
  Genre,
  PaginationMeta,
  TvShow,
  TvShowSearchParams,
  TvShowSummary,
} from "@naijaspride/types";
import { withCache } from "../../shared/services/redis.service";

type TvShowWithNested = Prisma.TvShowGetPayload<{
  include: {
    seasons: {
      orderBy: { seasonNumber: "asc" };
      include: {
        episodes: {
          orderBy: { episodeNumber: "asc" };
        };
      };
    };
  };
}>;

export class TvShowsService {
  constructor(private readonly prisma: PrismaClient) {}

  async search(
    params: TvShowSearchParams,
  ): Promise<{ data: TvShowSummary[]; meta: PaginationMeta }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.TvShowWhereInput = {
      status: "active",
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: "insensitive" } },
              { overview: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(params.genre?.length
        ? { genre: { hasSome: params.genre as unknown as PrismaGenre[] } }
        : {}),
      ...(params.year ? { year: params.year } : {}),
      ...(params.language
        ? { language: { contains: params.language, mode: "insensitive" } }
        : {}),
    };

    const orderBy =
      params.sortBy === "popular"
        ? { viewCount: "desc" as const }
        : params.sortBy === "title"
          ? { title: "asc" as const }
          : params.sortBy === "trending"
            ? { createdAt: "desc" as const }
            : { createdAt: "desc" as const };

    const cacheKey = `tv-shows:search:${JSON.stringify({ ...params, page, limit })}`;

    return withCache(cacheKey, 300, async () => {
      const [total, shows] = await Promise.all([
        this.prisma.tvShow.count({ where }),
        this.prisma.tvShow.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            seasons: {
              select: {
                id: true,
                _count: {
                  select: { episodes: true },
                },
              },
            },
          },
        }),
      ]);

      const data = shows.map((show) => this.mapToSummary(show));
      const meta: PaginationMeta = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      };

      return { data, meta };
    });
  }

  async findBySlug(slug: string): Promise<TvShow | null> {
    return withCache(`tv-show:${slug}`, 600, async () => {
      const show = await this.prisma.tvShow.findUnique({
        where: { slug },
        include: {
          seasons: {
            orderBy: { seasonNumber: "asc" },
            include: {
              episodes: {
                orderBy: { episodeNumber: "asc" },
              },
            },
          },
        },
      });

      if (!show) return null;
      return this.mapToShow(show);
    });
  }

  async resolveEpisode(
    slug: string,
    seasonNumber: number,
    episodeNumber: number,
  ) {
    const show = await this.prisma.tvShow.findUnique({
      where: { slug },
      select: {
        id: true,
        imdbId: true,
        tmdbId: true,
        seasons: {
          where: { seasonNumber },
          select: {
            id: true,
            episodes: {
              where: { episodeNumber },
              select: { id: true, title: true },
              take: 1,
            },
          },
          take: 1,
        },
      },
    });

    if (!show) return null;
    const season = show.seasons[0];
    const episode = season?.episodes[0];
    if (!season || !episode) return null;

    return {
      showId: show.id,
      episodeId: episode.id,
      episodeTitle: episode.title,
      imdbId: show.imdbId,
      tmdbId: show.tmdbId,
      seasonNumber,
      episodeNumber,
    };
  }

  async saveProgress(
    userId: string,
    payload: {
      showId: string;
      episodeId: string;
      seasonNumber: number;
      episodeNumber: number;
      progress: number;
      duration: number;
    },
  ): Promise<void> {
    await this.prisma.tvWatchHistory.upsert({
      where: {
        userId_showId: {
          userId,
          showId: payload.showId,
        },
      },
      update: {
        episodeId: payload.episodeId,
        progress: payload.progress,
        duration: payload.duration,
        updatedAt: new Date(),
      },
      create: {
        userId,
        showId: payload.showId,
        episodeId: payload.episodeId,
        progress: payload.progress,
        duration: payload.duration,
      },
    });
  }

  async getProgress(userId: string, showId: string) {
    return this.prisma.tvWatchHistory.findUnique({
      where: { userId_showId: { userId, showId } },
    });
  }

  async getHistory(userId: string, limit = 10) {
    const rows = await this.prisma.tvWatchHistory.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        show: {
          select: {
            id: true,
            title: true,
            slug: true,
            posterUrl: true,
            thumbnailUrl: true,
          },
        },
      },
    });

    if (rows.length === 0) return [];

    // Batch-load all needed episodes in a single query — avoids loading every
    // season + episode for every show just to find one episode's metadata.
    const episodeIds = rows.map((r) => r.episodeId).filter(Boolean);
    const episodes = await this.prisma.tvEpisode.findMany({
      where: { id: { in: episodeIds } },
      select: {
        id: true,
        title: true,
        episodeNumber: true,
        season: { select: { seasonNumber: true } },
      },
    });
    const episodeMap = new Map(episodes.map((e) => [e.id, e]));

    return rows.map((row) => {
      const ep = episodeMap.get(row.episodeId);
      const progressPct =
        row.duration > 0 ? Math.round((row.progress / row.duration) * 100) : 0;

      return {
        showId: row.showId,
        title: row.show.title,
        slug: row.show.slug,
        posterUrl: row.show.posterUrl || row.show.thumbnailUrl,
        episodeId: row.episodeId,
        seasonNumber: ep?.season?.seasonNumber ?? null,
        episodeNumber: ep?.episodeNumber ?? null,
        episodeTitle: ep?.title ?? null,
        progress: row.progress,
        duration: row.duration,
        progressPercentage: Math.min(100, progressPct),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  private mapToSummary(
    row: Prisma.TvShowGetPayload<{
      include: {
        seasons: {
          select: {
            id: true;
            _count: { select: { episodes: true } };
          };
        };
      };
    }>,
  ): TvShowSummary {
    const seasonCount = row.seasons.length;
    const episodeCount = row.seasons.reduce(
      (sum, season) => sum + season._count.episodes,
      0,
    );

    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      year: row.year,
      genre: row.genre as unknown as Genre[],
      thumbnailUrl: row.thumbnailUrl,
      posterUrl: row.posterUrl,
      backdropUrl: row.backdropUrl,
      imdbId: row.imdbId,
      tmdbId: row.tmdbId,
      canStream: !!row.imdbId || !!row.tmdbId,
      seasonCount,
      episodeCount,
      viewCount: row.viewCount,
    };
  }

  private mapToShow(row: TvShowWithNested): TvShow {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      overview: row.overview,
      year: row.year,
      genre: row.genre as unknown as Genre[],
      language: row.language,
      imdbId: row.imdbId,
      tmdbId: row.tmdbId,
      thumbnailUrl: row.thumbnailUrl,
      posterUrl: row.posterUrl,
      backdropUrl: row.backdropUrl,
      trailerUrl: row.trailerUrl,
      viewCount: row.viewCount,
      status: row.status as unknown as ContentStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      seasons: row.seasons.map((season) => ({
        id: season.id,
        seasonNumber: season.seasonNumber,
        title: season.title,
        overview: season.overview,
        posterUrl: season.posterUrl,
        episodes: season.episodes.map((episode) => ({
          id: episode.id,
          episodeNumber: episode.episodeNumber,
          title: episode.title,
          overview: episode.overview,
          durationMinutes: episode.durationMinutes,
          thumbnailUrl: episode.thumbnailUrl,
        })),
      })),
    };
  }
}
