import { PrismaClient, Prisma } from "@prisma/client";
import { WrappedStatsService, WrappedStats } from "./wrapped-stats.service";
import { WrappedImageService, CardUrls } from "./wrapped-image.service";

export class WrappedService {
  private statsService: WrappedStatsService;
  private imageService: WrappedImageService;

  constructor(private readonly prisma: PrismaClient) {
    this.statsService = new WrappedStatsService(prisma);
    this.imageService = new WrappedImageService();
  }

  /**
   * Generate wrapped for a specific user and period.
   * Returns existing if already generated, unless force=true.
   */
  async generateForUser(
    userId: string,
    period: string,
    options: { force?: boolean; skipImages?: boolean } = {},
  ): Promise<{ stats: WrappedStats; cardUrls: CardUrls | null }> {
    // Check if already exists
    const existing = await this.prisma.userWrappedStats.findUnique({
      where: { userId_period: { userId, period } },
    });

    if (existing && !options.force) {
      return {
        stats: existing.statsJson as unknown as WrappedStats,
        cardUrls: existing.cardUrls as unknown as CardUrls | null,
      };
    }

    // Compute stats
    const stats = await this.statsService.computeForUser(userId, period);

    // Generate images (unless skipped)
    let cardUrls: CardUrls | null = null;
    if (!options.skipImages) {
      if (existing) {
        // Delete old images first if regenerating
        await this.imageService.deleteWrappedImages(userId, period);
      }
      cardUrls = await this.imageService.generateAllCards(stats, userId);
    }

    // Save to database
    await this.prisma.userWrappedStats.upsert({
      where: { userId_period: { userId, period } },
      create: {
        userId,
        period,
        statsJson: stats as Prisma.InputJsonValue,
        cardUrls: cardUrls as Prisma.InputJsonValue,
      },
      update: {
        statsJson: stats as Prisma.InputJsonValue,
        cardUrls: cardUrls as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    return { stats, cardUrls };
  }

  /**
   * Get wrapped for a user (generates on-demand if missing)
   */
  async getForUser(
    userId: string,
    period: string,
  ): Promise<{
    stats: WrappedStats;
    cardUrls: CardUrls | null;
  } | null> {
    // Check existing
    const existing = await this.prisma.userWrappedStats.findUnique({
      where: { userId_period: { userId, period } },
    });

    if (existing) {
      return {
        stats: existing.statsJson as unknown as WrappedStats,
        cardUrls: existing.cardUrls as unknown as CardUrls | null,
      };
    }

    // Generate on-demand
    return this.generateForUser(userId, period);
  }

  /**
   * Get public wrapped data (for shareable links)
   * Only returns if explicitly allowed or if period is old enough
   */
  async getPublicWrapped(
    userId: string,
    period: string,
  ): Promise<{
    stats: WrappedStats;
    cardUrls: CardUrls | null;
    userName: string | null;
  } | null> {
    // Single query to get both wrapped and user name, avoiding N+1
    const wrappedWithUser = await this.prisma.userWrappedStats.findUnique({
      where: { userId_period: { userId, period } },
      include: {
        user: {
          select: { name: true },
        },
      },
    });

    if (wrappedWithUser) {
      return {
        stats: wrappedWithUser.statsJson as unknown as WrappedStats,
        cardUrls: wrappedWithUser.cardUrls as unknown as CardUrls | null,
        userName: wrappedWithUser.user?.name || null,
      };
    }

    // Generate on-demand if missing
    const wrapped = await this.generateForUser(userId, period);

    // Get user name in a separate query (only when generation happens)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    return {
      ...wrapped,
      userName: user?.name || null,
    };
  }

  /**
   * Get all periods available for a user
   */
  async getAvailablePeriods(userId: string): Promise<string[]> {
    const periods = await this.prisma.userWrappedStats.findMany({
      where: { userId },
      orderBy: { period: "desc" },
      select: { period: true },
    });

    return periods.map((p) => p.period);
  }

  /**
   * Get current period string (YYYY-MM for monthly, YYYY-annual for annual)
   */
  static getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  static getAnnualPeriod(year?: number): string {
    const y = year || new Date().getFullYear();
    return `${y}-annual`;
  }

  /**
   * Check if we should generate annual wrapped (December 1st)
   */
  static shouldGenerateAnnual(): boolean {
    const now = new Date();
    return now.getMonth() === 11; // December (0-indexed)
  }

  /**
   * Batch generate for all active users in a period
   * Used by cron job
   */
  async generateForAllUsers(
    period: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ processed: number; errors: number }> {
    // Get active users (had any activity in the past 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { watchHistory: { some: { updatedAt: { gte: threeMonthsAgo } } } },
          { musicHistory: { some: { lastPlayedAt: { gte: threeMonthsAgo } } } },
          { bookProgress: { some: { updatedAt: { gte: threeMonthsAgo } } } },
          { mangaProgress: { some: { lastReadAt: { gte: threeMonthsAgo } } } },
        ],
      },
      select: { id: true },
      take: options.limit || 1000,
      skip: options.offset || 0,
    });

    let processed = 0;
    let errors = 0;

    // Process users in batches with concurrency control to avoid blocking the event loop
    const CONCURRENCY = 10;
    for (let i = 0; i < users.length; i += CONCURRENCY) {
      const batch = users.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((u) => this.generateForUser(u.id, period)),
      );
      errors += results.filter((r) => r.status === "rejected").length;
      processed += results.filter((r) => r.status === "fulfilled").length;
    }

    return { processed, errors };
  }

  /**
   * Delete wrapped and images for a user
   */
  async deleteForUser(userId: string, period: string): Promise<void> {
    const existing = await this.prisma.userWrappedStats.findUnique({
      where: { userId_period: { userId, period } },
    });

    if (existing) {
      await this.imageService.deleteWrappedImages(userId, period);
      await this.prisma.userWrappedStats.delete({
        where: { userId_period: { userId, period } },
      });
    }
  }
}
