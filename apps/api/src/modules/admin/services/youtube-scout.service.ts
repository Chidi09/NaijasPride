import { google, youtube_v3 } from "googleapis";
import { PrismaClient } from "@prisma/client";

// Lazy YouTube client — only initialised when first used
let _youtube: youtube_v3.Youtube | null = null;
const getYoutube = () => {
  if (_youtube) return _youtube;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error("YOUTUBE_API_KEY environment variable is required");
  }
  _youtube = google.youtube({ version: "v3", auth: key });
  return _youtube;
};

export interface YouTubeVideoResult {
  youtubeId: string;
  title: string;
  description: string;
  thumbnail: string;
  channel: string;
  publishedAt: string;
}

export interface YouTubeChannelDiscoveryResult {
  requestedName: string;
  channelId: string | null;
  channelTitle: string;
  videos: YouTubeVideoResult[];
}

export class YoutubeScoutService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Batch check for existing YouTube movies to avoid N+1 queries
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
      const yt = getYoutube();
      const res = await yt.search.list({
        part: ["snippet"],
        q: "Nollywood Movie 2026 Full",
        type: ["video"],
        videoDuration: "long",
        regionCode: "NG",
        relevanceLanguage: "en",
        order: "viewCount",
        publishedAfter: new Date(
          Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        maxResults: 10,
      });

      return this.mapResults(res.data.items);
    } catch (error) {
      console.error("[YouTube Scout] Error scanning for movies:", error);
      return [];
    }
  }

  /**
   * Search for a specific movie title on YouTube
   */
  async searchByTitle(title: string, suffix = "Full Movie"): Promise<YouTubeVideoResult[]> {
    try {
      const yt = getYoutube();
      const res = await yt.search.list({
        part: ["snippet"],
        q: `${title} ${suffix}`,
        type: ["video"],
        videoDuration: "long",
        maxResults: 5,
      });

      return this.mapResults(res.data.items);
    } catch (error) {
      console.error(`[YouTube Scout] Error searching "${title}":`, error);
      return [];
    }
  }

  /**
   * Batch search: look up multiple titles at once.
   * Returns a map of searchTitle -> results[].
   */
  async searchByTitles(
    titles: string[],
    suffix = "Full Movie",
  ): Promise<Record<string, YouTubeVideoResult[]>> {
    const results: Record<string, YouTubeVideoResult[]> = {};
    for (const title of titles) {
      results[title] = await this.searchByTitle(title, suffix);
    }
    return results;
  }

  async searchByChannels(
    channelNames: string[],
    maxResultsPerChannel = 8,
  ): Promise<YouTubeChannelDiscoveryResult[]> {
    const yt = getYoutube();
    const safeMaxResults = Math.min(20, Math.max(1, maxResultsPerChannel));
    const output: YouTubeChannelDiscoveryResult[] = [];

    for (const rawName of channelNames) {
      const requestedName = rawName.trim();
      if (!requestedName) continue;

      try {
        const channelRes = await yt.search.list({
          part: ["snippet"],
          q: requestedName,
          type: ["channel"],
          regionCode: "NG",
          relevanceLanguage: "en",
          maxResults: 3,
        });

        const bestChannel = channelRes.data.items?.[0];
        const channelId = bestChannel?.id?.channelId || null;
        const channelTitle = bestChannel?.snippet?.channelTitle || requestedName;

        if (!channelId) {
          output.push({
            requestedName,
            channelId: null,
            channelTitle,
            videos: [],
          });
          continue;
        }

        const videosRes = await yt.search.list({
          part: ["snippet"],
          channelId,
          q: "Nollywood Full Movie",
          type: ["video"],
          videoDuration: "long",
          order: "date",
          maxResults: safeMaxResults,
        });

        output.push({
          requestedName,
          channelId,
          channelTitle,
          videos: this.mapResults(videosRes.data.items),
        });
      } catch (error) {
        console.error(`[YouTube Scout] Error searching channel "${requestedName}":`, error);
        output.push({
          requestedName,
          channelId: null,
          channelTitle: requestedName,
          videos: [],
        });
      }
    }

    return output;
  }

  private mapResults(items: youtube_v3.Schema$SearchResult[] | undefined): YouTubeVideoResult[] {
    return (
      items?.map((item) => ({
        youtubeId: item.id?.videoId || "",
        title: item.snippet?.title || "",
        description: item.snippet?.description || "",
        thumbnail: item.snippet?.thumbnails?.high?.url || "",
        channel: item.snippet?.channelTitle || "",
        publishedAt: item.snippet?.publishedAt || "",
      })) || []
    );
  }
}
