import { PrismaClient } from '@prisma/client';
import { google, youtube_v3 } from 'googleapis';
import { getRedis } from '../../../shared/services/redis.service';

// Lazy YouTube client
let _youtube: youtube_v3.Youtube | null = null;
const getYoutube = () => {
  if (_youtube) return _youtube;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error('YOUTUBE_API_KEY environment variable is required');
  }
  _youtube = google.youtube({ version: 'v3', auth: key });
  return _youtube;
};

export interface YouTubeVideoInfo {
  youtubeId: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  duration?: string;
  isImported?: boolean;
}

export interface ChannelVideosResult {
  videos: YouTubeVideoInfo[];
  nextPageToken: string | null;
  totalResults: number;
}

export interface ChannelStats {
  totalVideos: number;
  importedCount: number;
  remainingCount: number;
}

export interface BatchImportProgress {
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  currentBatch: number;
  totalBatches: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  errors: string[];
}

export class YouTubeChannelService {
  private readonly redis = getRedis();
  private readonly CACHE_TTL = 86400; // 24 hours
  private importProgress: Map<string, BatchImportProgress> = new Map();

  constructor(private prisma: PrismaClient) {}

  // ===== Channel Management =====

  async listChannels(): Promise<Array<any & { stats: ChannelStats }>> {
    const channels = await this.prisma.youTubeChannel.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const channelsWithStats = await Promise.all(
      channels.map(async (channel) => {
        return {
          ...channel,
          stats: {
            totalVideos: channel.totalVideos,
            importedCount: channel.importedCount,
            remainingCount: Math.max(0, channel.totalVideos - channel.importedCount),
          },
        };
      })
    );

    return channelsWithStats;
  }

  async addChannel(url: string) {
    // Extract channel ID from URL
    const channelId = await this.extractChannelId(url);
    if (!channelId) {
      throw new Error('Could not extract channel ID from URL');
    }

    // Check if channel already exists
    const existing = await this.prisma.youTubeChannel.findUnique({
      where: { channelId },
    });

    if (existing) {
      throw new Error('Channel already exists');
    }

    // Fetch channel info from YouTube
    const yt = getYoutube();
    const response = await yt.channels.list({
      part: ['snippet'],
      id: [channelId],
    });

    const channelInfo = response.data.items?.[0];
    if (!channelInfo) {
      throw new Error('Channel not found on YouTube');
    }

    // Create channel record
    const channel = await this.prisma.youTubeChannel.create({
      data: {
        name: channelInfo.snippet?.title || 'Unknown Channel',
        channelId,
        url,
        isActive: true,
      },
    });

    // Sync video count in background
    this.syncChannelStats(channelId).catch(console.error);

    return channel;
  }

  async deleteChannel(id: string): Promise<void> {
    await this.prisma.youTubeChannel.delete({
      where: { id },
    });
  }

  // ===== Video Fetching with Pagination =====

  async getChannelVideos(
    channelId: string,
    pageToken?: string,
    maxResults: number = 50
  ): Promise<ChannelVideosResult> {
    const cacheKey = `channel:videos:${channelId}:${pageToken || 'first'}`;
    
    // Check cache
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return JSON.parse(cached);
      }
    }

    // Search for videos from this channel
    const yt = getYoutube();
    const searchResponse = await yt.search.list({
      part: ['snippet'],
      channelId,
      type: ['video'],
      videoDuration: 'long', // Only long-form content (movies)
      order: 'date',
      maxResults,
      pageToken,
    });

    const videos: YouTubeVideoInfo[] = (searchResponse.data.items || []).map((item) => ({
      youtubeId: item.id?.videoId || '',
      title: item.snippet?.title || '',
      description: item.snippet?.description || '',
      thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
      publishedAt: item.snippet?.publishedAt || '',
    }));

    // Check which videos are already imported
    const youtubeIds = videos.map((v) => v.youtubeId).filter(Boolean);
    const existingMovies = await this.prisma.movie.findMany({
      where: { youtubeId: { in: youtubeIds } },
      select: { youtubeId: true },
    });
    const existingIds = new Set(existingMovies.map((m) => m.youtubeId));

    // Mark videos with import status
    const videosWithStatus = videos.map((video) => ({
      ...video,
      isImported: existingIds.has(video.youtubeId),
    }));

    const result: ChannelVideosResult = {
      videos: videosWithStatus,
      nextPageToken: searchResponse.data.nextPageToken || null,
      totalResults: searchResponse.data.pageInfo?.totalResults || 0,
    };

    // Cache for 24 hours
    if (this.redis) {
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      console.log(`[Cache SET] ${cacheKey}`);
    }

    return result;
  }

  // ===== Batch Import =====

  async startBatchImport(
    channelId: string,
    batchSize: number = 10
  ): Promise<string> {
    const progressId = `import:${channelId}:${Date.now()}`;
    
    // Initialize progress
    this.importProgress.set(progressId, {
      total: 0,
      processed: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      currentBatch: 0,
      totalBatches: 0,
      status: 'pending',
      errors: [],
    });

    // Start import in background
    this.runBatchImport(channelId, batchSize, progressId).catch((error) => {
      console.error(`[Batch Import] Failed for ${channelId}:`, error);
      const progress = this.importProgress.get(progressId);
      if (progress) {
        progress.status = 'failed';
        progress.errors.push(error.message);
      }
    });

    return progressId;
  }

  private async runBatchImport(
    channelId: string,
    batchSize: number,
    progressId: string
  ): Promise<void> {
    const progress = this.importProgress.get(progressId)!;
    progress.status = 'running';

    // Resolve channel name for metadata tagging
    const channelRecord = await this.prisma.youTubeChannel.findUnique({
      where: { channelId },
      select: { name: true },
    });
    const channelName = channelRecord?.name || channelId;

    let pageToken: string | undefined;
    const allVideos: YouTubeVideoInfo[] = [];

    // Fetch all videos from channel (respecting API limits)
    console.log(`[Batch Import] Fetching all videos from channel ${channelId}`);
    do {
      const result = await this.getChannelVideos(channelId, pageToken, 50);
      allVideos.push(...result.videos);
      pageToken = result.nextPageToken || undefined;

      // Limit to prevent infinite loops and API quota exhaustion
      if (allVideos.length >= 500) {
        console.log('[Batch Import] Reached 500 video limit, stopping fetch');
        break;
      }
    } while (pageToken);

    // Filter out already imported videos
    const youtubeIds = allVideos.map((v) => v.youtubeId);
    const existingMovies = await this.prisma.movie.findMany({
      where: { youtubeId: { in: youtubeIds } },
      select: { youtubeId: true },
    });
    const existingIds = new Set(existingMovies.map((m) => m.youtubeId));

    const videosToImport = allVideos.filter((v) => !existingIds.has(v.youtubeId));

    progress.total = videosToImport.length;
    progress.totalBatches = Math.ceil(videosToImport.length / batchSize);

    console.log(`[Batch Import] Found ${videosToImport.length} videos to import out of ${allVideos.length} total`);

    // Process in batches
    for (let i = 0; i < videosToImport.length; i += batchSize) {
      const batch = videosToImport.slice(i, i + batchSize);
      progress.currentBatch = Math.floor(i / batchSize) + 1;

      console.log(`[Batch Import] Processing batch ${progress.currentBatch}/${progress.totalBatches}`);

      for (const video of batch) {
        try {
          // Check if already exists (double-check)
          const existing = await this.prisma.movie.findFirst({
            where: { youtubeId: video.youtubeId },
          });

          if (existing) {
            progress.skipped++;
            continue;
          }

          // Create movie record
          const year = new Date(video.publishedAt).getFullYear() || new Date().getFullYear();
          const slug = `${video.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}`;

          await this.prisma.movie.create({
            data: {
              title: video.title,
              slug,
              description: video.description || null,
              year,
              genre: ['Nollywood'],
              quality: [],
              language: 'English',
              thumbnailUrl: video.thumbnail || null,
              youtubeId: video.youtubeId,
              isStreamOnly: true,
              fileUrls: {},
              fileSizes: {},
              status: 'active',
              metadata: { channelId, channelTitle: channelName },
            },
          });

          progress.imported++;
        } catch (error) {
          console.error(`[Batch Import] Failed to import ${video.title}:`, error);
          progress.failed++;
          progress.errors.push(`Failed to import "${video.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        progress.processed++;
      }

      // Small delay between batches to be nice to the database
      if (i + batchSize < videosToImport.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    progress.status = 'completed';

    // Update channel stats — recount from metadata for accuracy
    const actualCount = await this.prisma.movie.count({
      where: {
        isStreamOnly: true,
        metadata: { path: ['channelId'], equals: channelId },
      },
    });
    await this.prisma.youTubeChannel.update({
      where: { channelId },
      data: {
        importedCount: actualCount,
        lastSyncedAt: new Date(),
      },
    });

    // Clear cache for this channel
    if (this.redis) {
      const keys = await this.redis.keys(`channel:videos:${channelId}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }

    console.log(`[Batch Import] Completed for ${channelId}. Imported: ${progress.imported}, Skipped: ${progress.skipped}, Failed: ${progress.failed}`);
  }

  getImportProgress(progressId: string): BatchImportProgress | null {
    return this.importProgress.get(progressId) || null;
  }

  async monitorAllChannelsEvery6Hours() {
    const channels = await this.prisma.youTubeChannel.findMany({
      where: { isActive: true },
      select: { channelId: true },
    });

    for (const channel of channels) {
      try {
        await this.startBatchImport(channel.channelId, 10);
      } catch (error) {
        console.error(`[Channel Monitor] Failed for ${channel.channelId}:`, error);
      }
    }
  }

  // ===== Helper Methods =====

  private async extractChannelId(url: string): Promise<string | null> {
    // Handle different YouTube URL formats
    const patterns = [
      /youtube\.com\/c\/([^/?]+)/,
      /youtube\.com\/channel\/(UC[^/?]+)/,
      /youtube\.com\/user\/([^/?]+)/,
      /youtube\.com\/@([^/?]+)/,
      /youtu\.be\/c\/([^/?]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const identifier = match[1];
        
        // If it's already a channel ID (starts with UC), return it
        if (identifier.startsWith('UC')) {
          return identifier;
        }

        // Otherwise, we need to resolve the custom URL to a channel ID
        try {
          const yt = getYoutube();
          
          // Try searching for the channel
          const searchResponse = await yt.search.list({
            part: ['snippet'],
            q: identifier,
            type: ['channel'],
            maxResults: 1,
          });

          const channelId = searchResponse.data.items?.[0]?.id?.channelId;
          if (channelId) {
            return channelId;
          }
        } catch (error) {
          console.error('Error resolving channel:', error);
        }
      }
    }

    return null;
  }

  private async syncChannelStats(channelId: string): Promise<void> {
    try {
      const yt = getYoutube();
      
      // Get channel statistics
      const channelResponse = await yt.channels.list({
        part: ['statistics'],
        id: [channelId],
      });

      const stats = channelResponse.data.items?.[0]?.statistics;
      if (stats?.videoCount) {
        await this.prisma.youTubeChannel.update({
          where: { channelId },
          data: {
            totalVideos: parseInt(stats.videoCount, 10),
            lastSyncedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error(`[Channel Stats] Failed to sync stats for ${channelId}:`, error);
    }
  }

  /**
   * Backfill YouTubeChannel records from existing isStreamOnly movies.
   * Batches all stored youtubeIds through the YouTube videos.list API (50 per call)
   * to discover channelId + channelTitle, then upserts YouTubeChannel rows and
   * stamps each movie's metadata.channelId so future lookups are instant.
   */
  async backfillChannelsFromExistingMovies(): Promise<{
    processed: number;
    channelsFound: number;
    channelsCreated: number;
    moviesTagged: number;
    errors: string[];
  }> {
    const stats = { processed: 0, channelsFound: 0, channelsCreated: 0, moviesTagged: 0, errors: [] as string[] };

    // Fetch all stream-only movies that have a youtubeId
    const movies = await this.prisma.movie.findMany({
      where: { isStreamOnly: true, youtubeId: { not: null } },
      select: { id: true, youtubeId: true, metadata: true },
    });

    if (movies.length === 0) {
      return stats;
    }

    const yt = getYoutube();
    const BATCH = 50; // YouTube videos.list max ids per request

    for (let i = 0; i < movies.length; i += BATCH) {
      const batch = movies.slice(i, i + BATCH);
      const ids = batch.map((m) => m.youtubeId!).filter(Boolean);

      try {
        const res = await yt.videos.list({
          part: ['snippet'],
          id: ids,
          maxResults: BATCH,
        });

        const items = res.data.items || [];

        for (const item of items) {
          const videoId = item.id;
          const channelId = item.snippet?.channelId;
          const channelTitle = item.snippet?.channelTitle || 'Unknown Channel';

          if (!channelId || !videoId) continue;

          stats.channelsFound++;

          // Upsert the YouTubeChannel record
          const existing = await this.prisma.youTubeChannel.findUnique({ where: { channelId } });
          if (!existing) {
            await this.prisma.youTubeChannel.create({
              data: {
                channelId,
                name: channelTitle,
                url: `https://www.youtube.com/channel/${channelId}`,
                isActive: true,
              },
            });
            stats.channelsCreated++;
            // Sync video count in background
            this.syncChannelStats(channelId).catch(console.error);
          }

          // Stamp the movie's metadata with channelId so it's queryable without hitting the API again
          const movie = batch.find((m) => m.youtubeId === videoId);
          if (movie) {
            const existingMeta = (movie.metadata as Record<string, unknown>) || {};
            if (!existingMeta.channelId) {
              await this.prisma.movie.update({
                where: { id: movie.id },
                data: { metadata: { ...existingMeta, channelId, channelTitle } },
              });
              stats.moviesTagged++;
            }
          }
        }
      } catch (error) {
        const msg = `Batch ${Math.floor(i / BATCH) + 1} failed: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[Backfill] ${msg}`);
        stats.errors.push(msg);
      }

      stats.processed += batch.length;
    }

    // After backfill, refresh importedCount for each channel based on actual movie rows
    const channels = await this.prisma.youTubeChannel.findMany({
      where: { isActive: true },
      select: { id: true, channelId: true },
    });

    for (const channel of channels) {
      const count = await this.prisma.movie.count({
        where: {
          isStreamOnly: true,
          metadata: { path: ['channelId'], equals: channel.channelId },
        },
      });
      await this.prisma.youTubeChannel.update({
        where: { id: channel.id },
        data: { importedCount: count },
      });
    }

    return stats;
  }

  async registerDiscoveredChannel(channelId: string, channelTitle: string, requestedName: string) {
    const existing = await this.prisma.youTubeChannel.findUnique({ where: { channelId } });
    if (existing) {
      return this.prisma.youTubeChannel.update({
        where: { channelId },
        data: {
          name: channelTitle || existing.name,
          url: existing.url || `https://www.youtube.com/channel/${channelId}`,
          isActive: true,
        },
      });
    }

    return this.prisma.youTubeChannel.create({
      data: {
        channelId,
        name: channelTitle || requestedName,
        url: requestedName.startsWith('http') ? requestedName : `https://www.youtube.com/@${requestedName.replace(/^@/, '')}`,
        isActive: true,
      },
    });
  }

}
