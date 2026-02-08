import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";

const youtube = google.youtube({
  version: "v3",
  auth: process.env.YOUTUBE_API_KEY, // Get this from Google Cloud Console
});

export interface YouTubeVideoResult {
  youtubeId: string;
  title: string;
  description: string;
  thumbnail: string;
  channel: string;
  publishedAt: string;
}

export class YoutubeScoutService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Batch check for existing YouTube movies to avoid N+1 queries
   * Good Practice: Extract all IDs and query once instead of looping
   */
  async filterExistingMovies(youtubeIds: string[]): Promise<string[]> {
    const existing = await this.prisma.movie.findMany({
      where: { youtubeId: { in: youtubeIds } },
      select: { youtubeId: true },
    });
    const existingSet = new Set(
      existing
        .map((entry: { youtubeId: string | null }) => entry.youtubeId)
        .filter((youtubeId: string | null): youtubeId is string => !!youtubeId),
    );
    return youtubeIds.filter((id) => !existingSet.has(id));
  }

  /**
   * Finds trending Nollywood movies (Long form, High view count)
   */
  async scanForMovies(): Promise<YouTubeVideoResult[]> {
    try {
      const res = await youtube.search.list({
        part: ["snippet"],
        q: "Nollywood Movie 2026 Full",
        type: ["video"],
        videoDuration: "long", // > 20 mins
        regionCode: "NG", // Nigeria Only
        relevanceLanguage: "en",
        order: "viewCount", // Most popular first
        publishedAfter: new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString(), // Last 7 days
        maxResults: 10,
      });

      return (
        res.data.items?.map((item) => ({
          youtubeId: item.id?.videoId || "",
          title: item.snippet?.title || "",
          description: item.snippet?.description || "",
          thumbnail: item.snippet?.thumbnails?.high?.url || "",
          channel: item.snippet?.channelTitle || "",
          publishedAt: item.snippet?.publishedAt || "",
        })) || []
      );
    } catch (error) {
      console.error("[YouTube Scout] Error scanning for movies:", error);
      return [];
    }
  }

  /**
   * Search for specific movie titles
   */
  async searchByTitle(title: string): Promise<YouTubeVideoResult[]> {
    try {
      const res = await youtube.search.list({
        part: ["snippet"],
        q: `${title} Nollywood Full Movie`,
        type: ["video"],
        videoDuration: "long",
        regionCode: "NG",
        maxResults: 5,
      });

      return (
        res.data.items?.map((item) => ({
          youtubeId: item.id?.videoId || "",
          title: item.snippet?.title || "",
          description: item.snippet?.description || "",
          thumbnail: item.snippet?.thumbnails?.high?.url || "",
          channel: item.snippet?.channelTitle || "",
          publishedAt: item.snippet?.publishedAt || "",
        })) || []
      );
    } catch (error) {
      console.error("[YouTube Scout] Error searching by title:", error);
      return [];
    }
  }
}
