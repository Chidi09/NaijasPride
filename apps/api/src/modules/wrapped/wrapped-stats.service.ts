import { PrismaClient } from "@prisma/client";

export type TopItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  count: number; // plays / chapters / watches
  minutes: number; // total estimated minutes
  subtitle?: string; // artist name, author, etc.
};

export type GenreStat = {
  name: string;
  count: number;
  percentage: number;
};

export type StreakInfo = {
  longestStreak: number; // consecutive active days
  currentStreak: number;
  totalActiveDays: number;
};

export type WrappedStats = {
  userId: string;
  period: string; // "2025-01" | "2025-annual"
  periodLabel: string; // "January 2025" | "2025"
  isAnnual: boolean;

  // ── Overview ────────────────────────────────────────────────────────────
  totalMinutes: number;
  totalMoviesWatched: number;
  totalMusicPlays: number;
  totalBooksRead: number; // books with any progress
  totalMangaChapters: number;
  totalHighlights: number;
  totalDownloads: number;

  // ── Top content ─────────────────────────────────────────────────────────
  topMovie: TopItem | null;
  topArtist: TopItem | null; // aggregated by artist name
  topSong: TopItem | null;
  topBook: TopItem | null;
  topMangaSeries: TopItem | null;

  // ── Genres ──────────────────────────────────────────────────────────────
  topGenres: GenreStat[]; // top 5, across all content types
  genrePersonality: string; // "Nollywood Drama Connoisseur" etc.

  // ── Streaks ─────────────────────────────────────────────────────────────
  streak: StreakInfo;

  // ── Fun facts ───────────────────────────────────────────────────────────
  funFact: string; // e.g. "You listened to music at midnight 8 times"
  milestoneLabel: string | null; // "100 hours watched!" etc.
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parsePeriod(period: string): {
  start: Date;
  end: Date;
  label: string;
  isAnnual: boolean;
} {
  if (period.endsWith("-annual")) {
    const year = parseInt(period.replace("-annual", ""), 10);
    return {
      start: new Date(`${year}-01-01T00:00:00.000Z`),
      end: new Date(`${year}-12-31T23:59:59.999Z`),
      label: String(year),
      isAnnual: true,
    };
  }
  const [year, month] = period.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const label = start.toLocaleString("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { start, end, label, isAnnual: false };
}

function computeStreaks(dates: Date[]): StreakInfo {
  if (dates.length === 0)
    return { longestStreak: 0, currentStreak: 0, totalActiveDays: 0 };

  // Unique calendar days (UTC)
  const days = Array.from(
    new Set(dates.map((d) => d.toISOString().slice(0, 10))),
  ).sort();

  const totalActiveDays = days.length;
  let longest = 1,
    current = 1;

  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const curr = new Date(days[i]);
    const diff = (curr.getTime() - prev.getTime()) / 86_400_000;
    if (diff === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  // Check if streak extends to today
  const today = new Date().toISOString().slice(0, 10);
  const lastDay = days[days.length - 1];
  const daysSinceLast =
    (new Date(today).getTime() - new Date(lastDay).getTime()) / 86_400_000;
  const currentStreak = daysSinceLast <= 1 ? current : 0;

  return { longestStreak: longest, currentStreak, totalActiveDays };
}

function genrePersonalityLabel(topGenre: string): string {
  const map: Record<string, string> = {
    Nollywood: "Nollywood Drama Connoisseur",
    Action: "Action Fanatic",
    Comedy: "Comedy Aficionado",
    Drama: "Drama Devotee",
    Horror: "Horror Enthusiast",
    Thriller: "Thriller Seeker",
    Romance: "Hopeless Romantic",
    Bollywood: "Bollywood Lover",
    Hollywood: "Hollywood Blockbuster Fan",
    Yoruba: "Yoruba Cinema Loyalist",
    Igbo: "Igbo Stories Champion",
    Hausa: "Hausa Film Enthusiast",
    Animation: "Animation Aficionado",
    SciFi: "Sci-Fi Explorer",
    Family: "Family First Viewer",
    Afrobeat: "Afrobeat Devotee",
    Afropop: "Afropop Trendsetter",
    HipHop: "Hip-Hop Head",
    Gospel: "Gospel Spirit",
    Highlife: "Highlife Historian",
    Amapiano: "Amapiano Move-Maker",
  };
  return map[topGenre] ?? `${topGenre} Explorer`;
}

function buildFunFact(stats: Partial<WrappedStats>): string {
  const hrs = Math.round((stats.totalMinutes ?? 0) / 60);
  if (stats.topArtist && (stats.topArtist.count ?? 0) > 20) {
    return `You played ${stats.topArtist.title} songs ${stats.topArtist.count} times — that's dedication!`;
  }
  if ((stats.streak?.longestStreak ?? 0) >= 7) {
    return `You were on a ${stats.streak!.longestStreak}-day watching streak. Impressive!`;
  }
  if (hrs > 50) {
    return `You spent ${hrs} hours on NaijasPride. That's ${Math.round(hrs / 24)} full days!`;
  }
  if ((stats.totalHighlights ?? 0) > 10) {
    return `You made ${stats.totalHighlights} highlights while reading. You're a scholar!`;
  }
  return `You enjoyed ${stats.totalMoviesWatched ?? 0} movies, ${stats.totalMusicPlays ?? 0} songs, and ${stats.totalBooksRead ?? 0} books this period.`;
}

function buildMilestoneLabel(stats: Partial<WrappedStats>): string | null {
  const hrs = Math.round((stats.totalMinutes ?? 0) / 60);
  if (hrs >= 100) return `${hrs} Hours of Entertainment!`;
  if (hrs >= 50) return "50+ Hours Club";
  if ((stats.totalMangaChapters ?? 0) >= 100) return "100 Manga Chapters Read!";
  if ((stats.totalBooksRead ?? 0) >= 5) return "5 Books Finished!";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main service
// ─────────────────────────────────────────────────────────────────────────────

export class WrappedStatsService {
  constructor(private readonly prisma: PrismaClient) {}

  async computeForUser(userId: string, period: string): Promise<WrappedStats> {
    const { start, end, label, isAnnual } = parsePeriod(period);

    const [
      movieStats,
      musicStats,
      bookStats,
      mangaStats,
      highlightCount,
      downloadCount,
      allActivityDates,
    ] = await Promise.all([
      this.getMovieStats(userId, start, end),
      this.getMusicStats(userId, start, end),
      this.getBookStats(userId, start, end),
      this.getMangaStats(userId, start, end),
      this.getHighlightCount(userId, start, end),
      this.getDownloadCount(userId, start, end),
      this.getAllActivityDates(userId, start, end),
    ]);

    const totalMinutes =
      movieStats.totalMinutes +
      musicStats.totalMinutes +
      bookStats.totalMinutes;

    // ── Merge genres across all content types ────────────────────────────
    const genreMap = new Map<string, number>();
    for (const g of movieStats.genres)
      genreMap.set(g.name, (genreMap.get(g.name) ?? 0) + g.count * 2); // weight movies higher
    for (const g of musicStats.genres)
      genreMap.set(g.name, (genreMap.get(g.name) ?? 0) + g.count);
    for (const g of bookStats.genres)
      genreMap.set(g.name, (genreMap.get(g.name) ?? 0) + g.count);

    const totalGenreCount =
      Array.from(genreMap.values()).reduce((a, b) => a + b, 0) || 1;
    const topGenres: GenreStat[] = Array.from(genreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / totalGenreCount) * 100),
      }));

    const topGenreName = topGenres[0]?.name ?? "Entertainment";

    const streak = computeStreaks(allActivityDates);

    const partial: Partial<WrappedStats> = {
      totalMinutes,
      totalMoviesWatched: movieStats.totalWatched,
      totalMusicPlays: musicStats.totalPlays,
      totalBooksRead: bookStats.totalRead,
      totalMangaChapters: mangaStats.totalChapters,
      totalHighlights: highlightCount,
      totalDownloads: downloadCount,
      topArtist: musicStats.topArtist,
      streak,
    };

    return {
      userId,
      period,
      periodLabel: label,
      isAnnual,

      totalMinutes,
      totalMoviesWatched: movieStats.totalWatched,
      totalMusicPlays: musicStats.totalPlays,
      totalBooksRead: bookStats.totalRead,
      totalMangaChapters: mangaStats.totalChapters,
      totalHighlights: highlightCount,
      totalDownloads: downloadCount,

      topMovie: movieStats.topMovie,
      topArtist: musicStats.topArtist,
      topSong: musicStats.topSong,
      topBook: bookStats.topBook,
      topMangaSeries: mangaStats.topSeries,

      topGenres,
      genrePersonality: genrePersonalityLabel(topGenreName),

      streak,
      funFact: buildFunFact(partial),
      milestoneLabel: buildMilestoneLabel(partial),
    };
  }

  // ── Movies ──────────────────────────────────────────────────────────────

  private async getMovieStats(userId: string, start: Date, end: Date) {
    const history = await this.prisma.watchHistory.findMany({
      where: { userId, updatedAt: { gte: start, lte: end } },
      include: {
        movie: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            posterUrl: true,
            genre: true,
            durationMinutes: true,
          },
        },
      },
    });

    if (history.length === 0) {
      return { totalWatched: 0, totalMinutes: 0, topMovie: null, genres: [] };
    }

    let totalMinutes = 0;
    const genreMap = new Map<string, number>();

    for (const h of history) {
      const dur = h.movie.durationMinutes ?? 90;
      const watchedFraction =
        h.duration > 0 ? Math.min(h.progress / h.duration, 1) : 0.5;
      totalMinutes += Math.round(dur * watchedFraction);

      for (const g of h.movie.genre) {
        genreMap.set(g, (genreMap.get(g) ?? 0) + 1);
      }
    }

    // Top movie by watch count (unique updates in period = re-watches)
    const sorted = [...history].sort((a, b) => b.progress - a.progress);
    const top = sorted[0];

    return {
      totalWatched: history.length,
      totalMinutes,
      topMovie: {
        id: top.movie.id,
        title: top.movie.title,
        imageUrl: top.movie.posterUrl ?? top.movie.thumbnailUrl,
        count: 1,
        minutes: Math.round(
          (top.movie.durationMinutes ?? 90) *
            Math.min(top.progress / Math.max(top.duration, 1), 1),
        ),
      } as TopItem,
      genres: Array.from(genreMap.entries()).map(([name, count]) => ({
        name,
        count,
        percentage: 0,
      })),
    };
  }

  // ── Music ───────────────────────────────────────────────────────────────

  private async getMusicStats(userId: string, start: Date, end: Date) {
    const history = await this.prisma.musicWatchHistory.findMany({
      where: { userId, lastPlayedAt: { gte: start, lte: end } },
      include: {
        music: {
          select: {
            id: true,
            title: true,
            artist: true,
            genre: true,
            thumbnailUrl: true,
            hdThumbnailUrl: true,
            durationSeconds: true,
          },
        },
      },
    });

    if (history.length === 0) {
      return {
        totalPlays: 0,
        totalMinutes: 0,
        topSong: null,
        topArtist: null,
        genres: [],
      };
    }

    const totalPlays = history.reduce((s, h) => s + h.playCount, 0);
    const totalMinutes = history.reduce((s, h) => {
      const dur = (h.music.durationSeconds ?? 210) / 60;
      return s + Math.round(dur * h.playCount);
    }, 0);

    // Top song
    const topSongEntry = [...history].sort(
      (a, b) => b.playCount - a.playCount,
    )[0];

    // Top artist (aggregate across songs)
    const artistMap = new Map<
      string,
      { plays: number; imageUrl: string | null }
    >();
    for (const h of history) {
      const existing = artistMap.get(h.music.artist);
      artistMap.set(h.music.artist, {
        plays: (existing?.plays ?? 0) + h.playCount,
        imageUrl:
          existing?.imageUrl ?? h.music.hdThumbnailUrl ?? h.music.thumbnailUrl,
      });
    }
    const topArtistEntry = Array.from(artistMap.entries()).sort(
      (a, b) => b[1].plays - a[1].plays,
    )[0];

    const genreMap = new Map<string, number>();
    for (const h of history) {
      for (const g of h.music.genre) {
        genreMap.set(g, (genreMap.get(g) ?? 0) + h.playCount);
      }
    }

    return {
      totalPlays,
      totalMinutes,
      topSong: {
        id: topSongEntry.music.id,
        title: topSongEntry.music.title,
        subtitle: topSongEntry.music.artist,
        imageUrl:
          topSongEntry.music.hdThumbnailUrl ?? topSongEntry.music.thumbnailUrl,
        count: topSongEntry.playCount,
        minutes: Math.round(
          ((topSongEntry.music.durationSeconds ?? 210) / 60) *
            topSongEntry.playCount,
        ),
      } as TopItem,
      topArtist: topArtistEntry
        ? ({
            id: topArtistEntry[0],
            title: topArtistEntry[0],
            imageUrl: topArtistEntry[1].imageUrl,
            count: topArtistEntry[1].plays,
            minutes: 0,
          } as TopItem)
        : null,
      genres: Array.from(genreMap.entries()).map(([name, count]) => ({
        name,
        count,
        percentage: 0,
      })),
    };
  }

  // ── Books ───────────────────────────────────────────────────────────────

  private async getBookStats(userId: string, start: Date, end: Date) {
    const progress = await this.prisma.bookProgress.findMany({
      where: { userId, updatedAt: { gte: start, lte: end } },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            author: true,
            coverUrl: true,
            pageCount: true,
            genre: true,
          },
        },
      },
    });

    if (progress.length === 0) {
      return { totalRead: 0, totalMinutes: 0, topBook: null, genres: [] };
    }

    // Estimate 1.5 minutes per page
    const totalMinutes = progress.reduce((s, p) => {
      return s + Math.round(p.page * 1.5);
    }, 0);

    const genreMap = new Map<string, number>();
    for (const p of progress) {
      for (const g of p.book.genre) {
        genreMap.set(g, (genreMap.get(g) ?? 0) + 1);
      }
    }

    const topEntry = [...progress].sort((a, b) => b.page - a.page)[0];

    return {
      totalRead: progress.length,
      totalMinutes,
      topBook: {
        id: topEntry.book.id,
        title: topEntry.book.title,
        subtitle: topEntry.book.author,
        imageUrl: topEntry.book.coverUrl,
        count: topEntry.page,
        minutes: Math.round(topEntry.page * 1.5),
      } as TopItem,
      genres: Array.from(genreMap.entries()).map(([name, count]) => ({
        name,
        count,
        percentage: 0,
      })),
    };
  }

  // ── Manga ───────────────────────────────────────────────────────────────

  private async getMangaStats(userId: string, start: Date, end: Date) {
    const progress = await this.prisma.mangaReadingProgress.findMany({
      where: { userId, lastReadAt: { gte: start, lte: end } },
    });

    if (progress.length === 0) {
      return { totalChapters: 0, topSeries: null };
    }

    // Group by mangaId to find top series
    const seriesMap = new Map<
      string,
      { chapters: number; lastChapterId: string }
    >();
    for (const p of progress) {
      const existing = seriesMap.get(p.mangaId);
      seriesMap.set(p.mangaId, {
        chapters: (existing?.chapters ?? 0) + 1,
        lastChapterId: p.chapterId,
      });
    }

    // Cross-reference with MangaFavorite to get title + cover
    const topMangaId = Array.from(seriesMap.entries()).sort(
      (a, b) => b[1].chapters - a[1].chapters,
    )[0]?.[0];

    let topSeries: TopItem | null = null;
    if (topMangaId) {
      const fav = await this.prisma.mangaFavorite.findFirst({
        where: { userId, mangaId: topMangaId },
      });
      // Also check offline manga for title if not favorited
      const offlineEntry = !fav
        ? await this.prisma.offlineMangaChapter.findFirst({
            where: { userId, mangaId: topMangaId },
          })
        : null;
      const title = fav?.title ?? offlineEntry?.mangaTitle ?? topMangaId;
      const coverUrl = fav?.coverUrl ?? offlineEntry?.mangaTitle ?? null;

      topSeries = {
        id: topMangaId,
        title,
        imageUrl: coverUrl,
        count: seriesMap.get(topMangaId)!.chapters,
        minutes: Math.round(seriesMap.get(topMangaId)!.chapters * 8), // ~8 min per chapter
      };
    }

    return {
      totalChapters: progress.length,
      topSeries,
    };
  }

  // ── Supporting queries ───────────────────────────────────────────────────

  private async getHighlightCount(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    return this.prisma.bookHighlight.count({
      where: { userId, createdAt: { gte: start, lte: end } },
    });
  }

  private async getDownloadCount(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    return this.prisma.download.count({
      where: { userId, timestamp: { gte: start, lte: end } },
    });
  }

  private async getAllActivityDates(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<Date[]> {
    const [movieDates, musicDates, bookDates, mangaDates] = await Promise.all([
      this.prisma.watchHistory
        .findMany({
          where: { userId, updatedAt: { gte: start, lte: end } },
          select: { updatedAt: true },
        })
        .then((r) => r.map((x) => x.updatedAt)),

      this.prisma.musicWatchHistory
        .findMany({
          where: { userId, lastPlayedAt: { gte: start, lte: end } },
          select: { lastPlayedAt: true },
        })
        .then((r) => r.map((x) => x.lastPlayedAt)),

      this.prisma.bookProgress
        .findMany({
          where: { userId, updatedAt: { gte: start, lte: end } },
          select: { updatedAt: true },
        })
        .then((r) => r.map((x) => x.updatedAt)),

      this.prisma.mangaReadingProgress
        .findMany({
          where: { userId, lastReadAt: { gte: start, lte: end } },
          select: { lastReadAt: true },
        })
        .then((r) => r.map((x) => x.lastReadAt)),
    ]);

    return [...movieDates, ...musicDates, ...bookDates, ...mangaDates];
  }
}
