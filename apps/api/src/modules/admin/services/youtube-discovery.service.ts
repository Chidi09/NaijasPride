import { PrismaClient } from "@prisma/client";
import { YoutubeScoutService } from "./youtube-scout.service";
import { YouTubeChannelService } from "./youtube-channel.service";

export class YoutubeDiscoveryService {
  private scout: YoutubeScoutService;
  private channelService: YouTubeChannelService;

  constructor(private prisma: PrismaClient) {
    this.scout = new YoutubeScoutService(prisma);
    this.channelService = new YouTubeChannelService(prisma);
  }

  /**
   * Run a full discovery cycle
   */
  async runDiscoveryCycle() {
    console.log("[Youtube Discovery] Starting discovery cycle...");
    const startTime = Date.now();

    try {
      // 1. Discover via Trending Videos
      const trendingVideos = await this.scout.discoverTrendingVideos(25);
      console.log(
        `[Youtube Discovery] Found ${trendingVideos.length} trending videos`,
      );

      for (const video of trendingVideos) {
        const v = video as { channelId?: string; channel?: string };
        if (v.channelId) {
          await this.channelService.registerDiscoveredChannel(
            v.channelId,
            v.channel || "Unknown Channel",
            v.channel || "Unknown Channel",
          );
        }
      }

      // 2. Discover via Niche Keywords
      const keywords = [
        "Nollywood Movies 2026 Full Movie",
        "Latest Yoruba Movies 2026",
        "Hausa Full Movies 2026",
        "Igbo Movies 2026",
        "Nigerian Cinema 2026",
      ];

      const keywordResults = await this.scout.discoverByKeywords(keywords, 10);
      console.log(
        `[Youtube Discovery] Found ${keywordResults.length} videos via keyword search`,
      );

      for (const video of keywordResults) {
        const v = video as { channelId?: string; channel?: string };
        if (v.channelId) {
          await this.channelService.registerDiscoveredChannel(
            v.channelId,
            v.channel || "Unknown Channel",
            v.channel || "Unknown Channel",
          );
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Youtube Discovery] Cycle completed in ${duration}s`);
    } catch (error) {
      console.error("[Youtube Discovery] Cycle failed:", error);
    }
  }
}
