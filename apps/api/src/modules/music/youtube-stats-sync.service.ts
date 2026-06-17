import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";

const BATCH_SIZE = 50; // YouTube Data API max IDs per request

interface Logger {
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
}

export class YouTubeStatsSyncService {
  private youtube = google.youtube({
    version: "v3",
    auth: process.env.YOUTUBE_API_KEY,
  });

  constructor(
    private prisma: PrismaClient,
    private log: Logger,
  ) {}

  async syncAll(): Promise<void> {
    if (!process.env.YOUTUBE_API_KEY) {
      this.log.info("[YTStatsSync] No YOUTUBE_API_KEY set — skipping sync");
      return;
    }

    this.log.info("[YTStatsSync] Starting YouTube stats sync...");

    const videos = await this.prisma.musicVideo.findMany({
      where: { status: "active" },
      select: { id: true, youtubeId: true },
    });

    this.log.info(
      { count: videos.length },
      `[YTStatsSync] Syncing ${videos.length} videos in batches of ${BATCH_SIZE}`,
    );

    let updated = 0;
    let failed = 0;

    for (let i = 0; i < videos.length; i += BATCH_SIZE) {
      const batch = videos.slice(i, i + BATCH_SIZE);
      const youtubeIds = batch.map((v) => v.youtubeId);

      try {
        const response = await this.youtube.videos.list({
          part: ["statistics"],
          id: youtubeIds,
          maxResults: BATCH_SIZE,
        });

        const items = response.data.items ?? [];

        for (const item of items) {
          const ytId = item.id;
          const stats = item.statistics;
          if (!ytId || !stats) continue;

          const dbRecord = batch.find((v) => v.youtubeId === ytId);
          if (!dbRecord) continue;

          await this.prisma.musicVideo.update({
            where: { id: dbRecord.id },
            data: {
              ytViewCount: parseInt(stats.viewCount ?? "0", 10) || 0,
              ytLikeCount: parseInt(stats.likeCount ?? "0", 10) || 0,
              ytStatsUpdatedAt: new Date(),
            },
          });

          updated++;
        }

        this.log.info(
          {
            batch: Math.floor(i / BATCH_SIZE) + 1,
            itemsReturned: items.length,
          },
          `[YTStatsSync] Batch done`,
        );
      } catch (err) {
        failed++;
        this.log.error(
          { err, batch: Math.floor(i / BATCH_SIZE) + 1 },
          `[YTStatsSync] Batch failed`,
        );
      }

      // Small delay between batches to be gentle on the quota
      if (i + BATCH_SIZE < videos.length) {
        await new Promise<void>((res) => setTimeout(res, 500));
      }
    }

    this.log.info({ updated, failed }, "[YTStatsSync] Sync complete");
  }
}
