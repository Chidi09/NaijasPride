import { PrismaClient, Genre } from '@prisma/client';
import { google, youtube_v3 } from 'googleapis';
import { getRedis } from '../../../shared/services/redis.service';

/**
 * Strip YouTube noise from a video title so only the movie name remains.
 * Mirrors the shared-utils normalizeYouTubeTitle — kept inline so the API
 * build has no cross-workspace import dependency.
 */
function normalizeYouTubeTitle(raw: string): string {
  if (!raw) return raw;
  const pipeSegments = raw.split(/\s*[|–—]\s*/);
  const isNoise = (s: string) =>
    /\b(full\s+movie|full\s+film|official\s+movie|nollywood|hollywood|bollywood|yoruba|igbo|hausa|african|naija|4k|uhd|fhd|hd|1080p|720p|latest\s+movie|latest\s+film)\b/i.test(s);
  const candidate =
    pipeSegments.find((seg) => seg.trim().length > 0 && !isNoise(seg.trim())) ?? pipeSegments[0];
  let title = candidate.trim();
  title = title.replace(
    /^(?:latest|new|best|top)\s+(?:nollywood|yoruba|igbo|hausa|african|naija|hollywood|bollywood)?\s*(?:full\s+)?(?:movies?|films?)?\s*[-–—]?\s*/gi,
    '',
  );
  const noisePhrases = [
    /\bfull\s+(?:hd\s+)?(?:movie|film)\b/gi,
    /\bofficial\s+(?:full\s+)?(?:movie|film)\b/gi,
    /\bnollywood\s+(?:movies?|films?)?\b/gi,
    /\bhollywood\s+(?:movies?|films?)?\b/gi,
    /\bbolly\s*wood\s+(?:movies?|films?)?\b/gi,
    /\byoruba\s+(?:movies?|films?)?\b/gi,
    /\bigbo\s+(?:movies?|films?)?\b/gi,
    /\bhausa\s+(?:movies?|films?)?\b/gi,
    /\bafrican\s+(?:movies?|films?)?\b/gi,
    /\bnaija\s+(?:movies?|films?)?\b/gi,
    /\b(?:4k|uhd|fhd|full\s+hd|1080p|720p|480p|hd)\b/gi,
  ];
  for (const re of noisePhrases) title = title.replace(re, '');
  title = title.replace(/[\[(]\s*(?:19|20)\d{2}\s*[\])]/g, '');
  title = title.replace(/\b(?:19|20)\d{2}\b/g, '');
  title = title.replace(/\s{2,}/g, ' ').trim();
  title = title.replace(/^[-–—:,.\s]+|[-–—:,.\s]+$/g, '').trim();
  const letters = title.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 3) {
    const upperRatio = (letters.match(/[A-Z]/g) || []).length / letters.length;
    if (upperRatio > 0.6) {
      title = title.toLowerCase().replace(/(?:^|\s|[-–—(])\S/g, (ch) => ch.toUpperCase());
    }
  }
  return title || raw.trim();
}

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

export interface BackfillProgress {
  processed: number;
  total: number;
  channelsFound: number;
  channelsCreated: number;
  moviesTagged: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  errors: string[];
}

export class YouTubeChannelService {
  private readonly redis = getRedis();
  private readonly CACHE_TTL = 86400; // 24 hours
  private importProgress: Map<string, BatchImportProgress> = new Map();
  private backfillProgress: Map<string, BackfillProgress> = new Map();
  private channelImportProgressId: Map<string, string> = new Map();
  private activeChannelImports: Set<string> = new Set();
  private activeBackfillJobId: string | null = null;
  private isMonitorRunning = false;
  private readonly MONITOR_MAX_IMPORTS_PER_CHANNEL = 10;
  private readonly MONITOR_MAX_SCAN_VIDEOS_PER_CHANNEL = 120;

  constructor(private prisma: PrismaClient) {}

  private inferMovieGenresFromText(title: string, channelName: string): Genre[] {
    const text = `${title} ${channelName}`.toLowerCase();
    if (text.includes('bollywood') || text.includes('hindi')) return [Genre.Bollywood];
    if (text.includes('nollywood') || text.includes('yoruba') || text.includes('igbo') || text.includes('hausa')) {
      return [Genre.Nollywood];
    }
    return [Genre.Hollywood];
  }

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

  async bootstrapChannels(urls: string[]): Promise<{ created: number; existing: number; failed: string[] }> {
    const sanitized = urls
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (sanitized.length === 0) {
      return { created: 0, existing: 0, failed: [] };
    }

    const yt = getYoutube();
    let created = 0;
    let existing = 0;
    const failed: string[] = [];

    for (const url of sanitized) {
      try {
        const channelId = await this.extractChannelId(url);
        if (!channelId) {
          failed.push(`${url} -> could not resolve channel ID`);
          continue;
        }

        const already = await this.prisma.youTubeChannel.findUnique({
          where: { channelId },
          select: { id: true },
        });
        if (already) {
          existing += 1;
          continue;
        }

        const channelInfo = await yt.channels.list({
          part: ['snippet'],
          id: [channelId],
          maxResults: 1,
        });

        const snippet = channelInfo.data.items?.[0]?.snippet;
        if (!snippet) {
          failed.push(`${url} -> channel not found on YouTube`);
          continue;
        }

        await this.prisma.youTubeChannel.create({
          data: {
            name: snippet.title || 'Unknown Channel',
            channelId,
            url,
            isActive: true,
          },
        });

        created += 1;
        this.syncChannelStats(channelId).catch(console.error);
      } catch (error) {
        failed.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { created, existing, failed };
  }

  // ===== Video Fetching with Pagination =====

  async getChannelVideos(
    channelId: string,
    pageToken?: string,
    maxResults: number = 50
  ): Promise<ChannelVideosResult> {
    const cacheKey = `channel:videos:${channelId}:${pageToken || 'first'}:${maxResults}`;
    
    // Check cache
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return JSON.parse(cached);
      }
    }

    // Use uploads playlist instead of search.list to drastically reduce
    // quota usage (playlistItems/videos are low-cost units compared to search).
    const yt = getYoutube();
    const uploadsPlaylistId = await this.getUploadsPlaylistId(channelId);
    const playlistResponse = await yt.playlistItems.list({
      part: ['snippet', 'contentDetails'],
      playlistId: uploadsPlaylistId,
      maxResults,
      pageToken,
    });

    const rawItems = (playlistResponse.data.items || []).filter((item) => {
      const id = item.contentDetails?.videoId;
      const title = item.snippet?.title || '';
      return !!id && title !== 'Private video' && title !== 'Deleted video';
    });

    const videoIds = rawItems
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => !!id);

    // Fetch durations to keep long-form videos only.
    const durationResponse = videoIds.length
      ? await yt.videos.list({
          part: ['contentDetails'],
          id: videoIds,
          maxResults: Math.min(50, videoIds.length),
        })
      : null;

    const durationMap = new Map<string, number>();
    for (const item of durationResponse?.data.items || []) {
      const id = item.id;
      const iso = item.contentDetails?.duration;
      if (!id || !iso) continue;
      durationMap.set(id, this.durationToSeconds(iso));
    }

    const MIN_LONG_FORM_SECONDS = 15 * 60;
    const videos: YouTubeVideoInfo[] = rawItems
      .filter((item) => {
        const id = item.contentDetails?.videoId;
        if (!id) return false;
        const seconds = durationMap.get(id) ?? 0;
        return seconds >= MIN_LONG_FORM_SECONDS;
      })
      .map((item) => ({
        youtubeId: item.contentDetails?.videoId || '',
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
        publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || '',
      }));

    // Check which videos are already imported
    const youtubeIds = videos.map((v) => v.youtubeId).filter(Boolean);
    const existingMovies = youtubeIds.length
      ? await this.prisma.movie.findMany({
          where: { youtubeId: { in: youtubeIds } },
          select: { youtubeId: true },
        })
      : [];
    const existingIds = new Set(existingMovies.map((m) => m.youtubeId));

    // Mark videos with import status
    const videosWithStatus = videos.map((video) => ({
      ...video,
      isImported: existingIds.has(video.youtubeId),
    }));

    const result: ChannelVideosResult = {
      videos: videosWithStatus,
      nextPageToken: playlistResponse.data.nextPageToken || null,
      totalResults: playlistResponse.data.pageInfo?.totalResults || 0,
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
    const existingProgressId = this.channelImportProgressId.get(channelId);
    if (existingProgressId) {
      const existingProgress = this.importProgress.get(existingProgressId);
      if (existingProgress && (existingProgress.status === 'pending' || existingProgress.status === 'running')) {
        return existingProgressId;
      }
    }

    const progressId = `import:${channelId}:${Date.now()}`;
    this.channelImportProgressId.set(channelId, progressId);
    
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
    progressId: string,
    options?: { maxVideosToImport?: number; maxVideosToScan?: number }
  ): Promise<void> {
    const progress = this.importProgress.get(progressId)!;
    progress.status = 'running';
    this.activeChannelImports.add(channelId);

    try {

    // Resolve channel name for metadata tagging
    const channelRecord = await this.prisma.youTubeChannel.findUnique({
      where: { channelId },
      select: { name: true },
    });
    const channelName = channelRecord?.name || channelId;

    let pageToken: string | undefined;
    const allVideos: YouTubeVideoInfo[] = [];

    const maxVideosToScan = options?.maxVideosToScan ?? 500;

    // Fetch videos from channel (respecting API limits)
    console.log(`[Batch Import] Fetching all videos from channel ${channelId}`);
    do {
      const result = await this.getChannelVideos(channelId, pageToken, 50);
      allVideos.push(...result.videos);
      pageToken = result.nextPageToken || undefined;

      // Limit to prevent infinite loops and API quota exhaustion
      if (allVideos.length >= maxVideosToScan) {
        console.log(`[Batch Import] Reached ${maxVideosToScan} video scan limit, stopping fetch`);
        break;
      }
    } while (pageToken);

    // Filter out already imported videos
    const youtubeIds = allVideos.map((v) => v.youtubeId);
    const existingMovies = youtubeIds.length
      ? await this.prisma.movie.findMany({
          where: { youtubeId: { in: youtubeIds } },
          select: { youtubeId: true },
        })
      : [];
    const existingIds = new Set(existingMovies.map((m) => m.youtubeId));

    const remainingVideos = allVideos.filter((v) => !existingIds.has(v.youtubeId));
    const videosToImport =
      typeof options?.maxVideosToImport === 'number'
        ? remainingVideos.slice(0, Math.max(0, options.maxVideosToImport))
        : remainingVideos;

    progress.total = videosToImport.length;
    progress.totalBatches = Math.ceil(videosToImport.length / batchSize);

    console.log(`[Batch Import] Found ${remainingVideos.length} remaining videos; importing ${videosToImport.length} this run out of ${allVideos.length} scanned`);

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
          const cleanTitle = normalizeYouTubeTitle(video.title);
          const year = new Date(video.publishedAt).getFullYear() || new Date().getFullYear();
          const baseSlug = `${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}`;
          const suffix = (video.youtubeId || '').toLowerCase().slice(0, 8);
          const slug = suffix ? `${baseSlug}-${suffix}` : baseSlug;

          await this.prisma.movie.create({
            data: {
              title: cleanTitle,
              slug,
              description: video.description || null,
              year,
              genre: this.inferMovieGenresFromText(video.title, channelName), // use raw title for genre hints
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
    } finally {
      this.activeChannelImports.delete(channelId);
      const currentProgressId = this.channelImportProgressId.get(channelId);
      if (currentProgressId === progressId) {
        this.channelImportProgressId.delete(channelId);
      }
    }
  }

  getImportProgress(progressId: string): BatchImportProgress | null {
    return this.importProgress.get(progressId) || null;
  }

  async monitorAllChannelsEvery6Hours() {
    if (this.isMonitorRunning) {
      console.log('[Channel Monitor] Previous run still active, skipping this cycle');
      return;
    }

    this.isMonitorRunning = true;
    try {
    const channels = await this.prisma.youTubeChannel.findMany({
      where: { isActive: true },
      select: { channelId: true },
      orderBy: { lastSyncedAt: 'asc' },
    });

    let processedChannels = 0;
    for (const channel of channels) {
      if (this.activeChannelImports.has(channel.channelId)) {
        continue;
      }

      try {
        const progressId = `monitor:${channel.channelId}:${Date.now()}`;
        this.channelImportProgressId.set(channel.channelId, progressId);
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

        console.log(`[Channel Monitor] Importing channel ${channel.channelId} (${processedChannels + 1}/${channels.length})`);
        await this.runBatchImport(channel.channelId, 10, progressId, {
          maxVideosToImport: this.MONITOR_MAX_IMPORTS_PER_CHANNEL,
          maxVideosToScan: this.MONITOR_MAX_SCAN_VIDEOS_PER_CHANNEL,
        });
        processedChannels++;

        // Small cool-down between channels to reduce quota spikes.
        await this.sleep(1500);
      } catch (error) {
        console.error(`[Channel Monitor] Failed for ${channel.channelId}:`, error);
      }
    }

    console.log(`[Channel Monitor] Completed cycle. Processed channels: ${processedChannels}`);
    } finally {
      this.isMonitorRunning = false;
    }
  }

  // ===== Helper Methods =====

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getUploadsPlaylistId(channelId: string): Promise<string> {
    const cacheKey = `channel:uploads-playlist:${channelId}`;
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return cached;
    }

    const yt = getYoutube();
    const response = await yt.channels.list({
      part: ['contentDetails'],
      id: [channelId],
      maxResults: 1,
    });

    const uploadsPlaylistId = response.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      throw new Error(`Could not resolve uploads playlist for channel ${channelId}`);
    }

    if (this.redis) {
      await this.redis.setex(cacheKey, this.CACHE_TTL, uploadsPlaylistId);
    }

    return uploadsPlaylistId;
  }

  private durationToSeconds(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    return (hours * 3600) + (minutes * 60) + seconds;
  }

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
   * Start a background backfill job and return a jobId immediately.
   * The actual work runs asynchronously so the HTTP request can return
   * before Vercel's function timeout fires.
   */
  startBackfill(): string {
    if (this.activeBackfillJobId) {
      const existing = this.backfillProgress.get(this.activeBackfillJobId);
      if (existing && (existing.status === 'pending' || existing.status === 'running')) {
        return this.activeBackfillJobId;
      }
      this.activeBackfillJobId = null;
    }

    const jobId = `backfill:${Date.now()}`;
    this.activeBackfillJobId = jobId;
    this.backfillProgress.set(jobId, {
      processed: 0,
      total: 0,
      channelsFound: 0,
      channelsCreated: 0,
      moviesTagged: 0,
      status: 'pending',
      errors: [],
    });

    // Fire and forget — runs in the background
    this.runBackfill(jobId).catch((error) => {
      console.error('[Backfill] Unhandled error:', error);
      const p = this.backfillProgress.get(jobId);
      if (p) {
        p.status = 'failed';
        p.errors.push(error instanceof Error ? error.message : String(error));
      }
      if (this.activeBackfillJobId === jobId) {
        this.activeBackfillJobId = null;
      }
    });

    return jobId;
  }

  getBackfillProgress(jobId: string): BackfillProgress | null {
    return this.backfillProgress.get(jobId) || null;
  }

  private async runBackfill(jobId: string): Promise<void> {
    const progress = this.backfillProgress.get(jobId)!;
    progress.status = 'running';

    const existingChannelRows = await this.prisma.youTubeChannel.findMany({
      select: { channelId: true },
    });
    const knownChannelIds = new Set(existingChannelRows.map((row) => row.channelId));
    const seenInThisRun = new Set<string>();

    // Fetch all stream-only movies that have a youtubeId but no channelId in metadata
    const movies = await this.prisma.movie.findMany({
      where: { isStreamOnly: true, youtubeId: { not: null } },
      select: { id: true, youtubeId: true, metadata: true },
    });

    progress.total = movies.length;

    if (movies.length === 0) {
      progress.status = 'completed';
      if (this.activeBackfillJobId === jobId) {
        this.activeBackfillJobId = null;
      }
      return;
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

          progress.channelsFound++;

          // Upsert channel once per unique channel in this backfill run.
          if (!seenInThisRun.has(channelId)) {
            seenInThisRun.add(channelId);

            await this.prisma.youTubeChannel.upsert({
              where: { channelId },
              update: {
                name: channelTitle,
                url: `https://www.youtube.com/channel/${channelId}`,
                isActive: true,
              },
              create: {
                channelId,
                name: channelTitle,
                url: `https://www.youtube.com/channel/${channelId}`,
                isActive: true,
              },
            });

            if (!knownChannelIds.has(channelId)) {
              knownChannelIds.add(channelId);
              progress.channelsCreated++;
            }

            // Sync video count in background — don't await, don't block
            this.syncChannelStats(channelId).catch(console.error);
          }

          // Stamp metadata.channelId on the movie for future DB-only counts
          const movie = batch.find((m) => m.youtubeId === videoId);
          if (movie) {
            const existingMeta = (movie.metadata as Record<string, unknown>) || {};
            if (!existingMeta.channelId) {
              await this.prisma.movie.update({
                where: { id: movie.id },
                data: { metadata: { ...existingMeta, channelId, channelTitle } },
              });
              progress.moviesTagged++;
            }
          }
        }
      } catch (error) {
        const msg = `Batch ${Math.floor(i / BATCH) + 1} failed: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[Backfill] ${msg}`);
        progress.errors.push(msg);
      }

      progress.processed += batch.length;
    }

    // Refresh importedCount for all channels from actual metadata tags
    try {
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
    } catch (error) {
      console.error('[Backfill] Failed to refresh importedCounts:', error);
    }

    progress.status = 'completed';
    console.log(`[Backfill] Done. channels=${progress.channelsCreated} movies=${progress.moviesTagged} errors=${progress.errors.length}`);

    if (this.activeBackfillJobId === jobId) {
      this.activeBackfillJobId = null;
    }

    // Start a monitor cycle immediately so discovered channels begin importing
    // content right away (still rate-limited inside monitorAllChannelsEvery6Hours).
    this.monitorAllChannelsEvery6Hours().catch((error) => {
      console.error('[Backfill] Auto import trigger failed:', error);
    });
  }

  async registerDiscoveredChannel(channelId: string, channelTitle: string, requestedName: string) {
    const existing = await this.prisma.youTubeChannel.findUnique({ where: { channelId } });
    
    // If it exists, just ensure it's active
    if (existing) {
      if (!existing.isActive) {
        return this.prisma.youTubeChannel.update({
          where: { channelId },
          data: { isActive: true },
        });
      }
      return existing;
    }

    // New channel: Perform basic validation before adding
    const isNollywood = await this.validateNollywoodChannel(channelId, channelTitle);
    if (!isNollywood) {
      console.log(`[Channel Service] Skipping non-Nollywood channel: ${channelTitle} (${channelId})`);
      return null;
    }

    console.log(`[Channel Service] Registering new Nollywood channel: ${channelTitle}`);
    return this.prisma.youTubeChannel.create({
      data: {
        channelId,
        name: channelTitle || requestedName,
        url: requestedName.startsWith('http') ? requestedName : `https://www.youtube.com/channel/${channelId}`,
        isActive: true,
      },
    });
  }

  /**
   * Basic validation to see if a channel is likely a Nollywood movie channel
   */
  private async validateNollywoodChannel(channelId: string, title: string): Promise<boolean> {
    const keywords = ['nollywood', 'movie', 'yoruba', 'igbo', 'hausa', 'cinema', 'film', 'official channel', 'tv', 'entertainment'];
    const titleLower = title.toLowerCase();
    
    // check title first
    if (keywords.some(k => titleLower.includes(k))) return true;

    try {
      const yt = getYoutube();
      const res = await yt.channels.list({
        part: ['snippet'],
        id: [channelId],
      });

      const description = res.data.items?.[0]?.snippet?.description?.toLowerCase() || '';
      return keywords.some(k => description.includes(k));
    } catch (error) {
      console.error(`[Channel Service] Validation failed for ${channelId}:`, error);
      return false;
    }
  }

}
