import { PrismaClient, MusicGenre, MusicRegion } from '@prisma/client';
import { google, youtube_v3 } from 'googleapis';
import { getRedis } from '../../shared/services/redis.service';

// Lazy YouTube client (shared singleton with movie service — different quota key)
let _youtube: youtube_v3.Youtube | null = null;
const getYoutube = () => {
  if (_youtube) return _youtube;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY environment variable is required');
  _youtube = google.youtube({ version: 'v3', auth: key });
  return _youtube;
};

// ─── Duration constants ────────────────────────────────────────────────────
const MIN_MUSIC_SECONDS = 2 * 60;  // 2 minutes
const MAX_MUSIC_SECONDS = 12 * 60; // 12 minutes

const TOP_NIGERIAN_MUSIC_SOURCES: Array<{
  url: string;
  artistName: string;
  region?: MusicRegion;
}> = [
  { url: 'https://www.youtube.com/@BurnaBoy', artistName: 'Burna Boy' },
  { url: 'https://www.youtube.com/@Wizkid', artistName: 'Wizkid' },
  { url: 'https://www.youtube.com/@davido', artistName: 'Davido' },
  { url: 'https://www.youtube.com/@heisrema', artistName: 'Rema' },
  { url: 'https://www.youtube.com/@temsbaby', artistName: 'Tems' },
  { url: 'https://www.youtube.com/@asakemusic', artistName: 'Asake' },
  { url: 'https://www.youtube.com/@AyraStarr', artistName: 'Ayra Starr' },
  { url: 'https://www.youtube.com/@FireboyDML', artistName: 'Fireboy DML' },
  { url: 'https://www.youtube.com/@KizzDaniel', artistName: 'Kizz Daniel' },
  { url: 'https://www.youtube.com/@officialolamide', artistName: 'Olamide' },
  { url: 'https://www.youtube.com/@MavinRecords', artistName: 'Mavin Records' },
  { url: 'https://www.youtube.com/@YBNLOfficial', artistName: 'YBNL Nation' },
  { url: 'https://www.youtube.com/@ChocolateCityMusic', artistName: 'Chocolate City Music' },
];

// ─── Title parser ──────────────────────────────────────────────────────────
// Handles patterns like:
//   "Burna Boy – Last Last (Official Video)"
//   "Wizkid - Essence ft. Tems (Official Music Video)"
//   "Asake - Joha (Lyric Video)"
function parseArtistTitle(rawTitle: string): { artist: string; title: string; featuring: string[] } {
  // Strip quality/type suffixes first
  const clean = rawTitle
    .replace(/\(Official\s*(Music\s*)?Video\)/gi, '')
    .replace(/\(Lyric\s*Video\)/gi, '')
    .replace(/\(Audio\)/gi, '')
    .replace(/\(Visualizer\)/gi, '')
    .replace(/\(4K\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .trim();

  // Split on – or - (with spaces)
  const separators = [' – ', ' - ', ' — '];
  for (const sep of separators) {
    const idx = clean.indexOf(sep);
    if (idx > 0) {
      const rawArtist = clean.slice(0, idx).trim();
      const rawTitle = clean.slice(idx + sep.length).trim();

      // Extract "ft." or "feat." artists from the title
      const featuring: string[] = [];
      const ftMatch = rawTitle.match(/\s+(?:ft\.|feat\.?)\s+(.+?)(?:\s*\(|$)/i);
      if (ftMatch) {
        const ftPart = ftMatch[1];
        featuring.push(...ftPart.split(/,\s*&\s*|,\s*|\s*&\s*/).map((s) => s.trim()).filter(Boolean));
      }

      const titleClean = rawTitle.replace(/\s+(?:ft\.|feat\.?)\s+.+/i, '').trim();

      return { artist: rawArtist, title: titleClean, featuring };
    }
  }

  // Fallback — return full title as title, artist unknown
  return { artist: 'Unknown', title: clean, featuring: [] };
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function durationToSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return parseInt(m[1] || '0') * 3600 + parseInt(m[2] || '0') * 60 + parseInt(m[3] || '0');
}

// ─── Progress tracking ─────────────────────────────────────────────────────

export interface MusicImportProgress {
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  errors: string[];
}

export interface MusicBootstrapResult {
  skipped: boolean;
  reason?: string;
  channelsCreated: number;
  channelsExisting: number;
  importsStarted: number;
  errors: string[];
}

// ─── Service ───────────────────────────────────────────────────────────────

export class YouTubeMusicService {
  private readonly redis = getRedis();
  private readonly CACHE_TTL = 86400; // 24 hours

  private importProgress = new Map<string, MusicImportProgress>();
  private activeImports = new Set<string>();
  private isMonitorRunning = false;

  constructor(private prisma: PrismaClient) {}

  // ─── Channel Management ────────────────────────────────────────────────

  async listChannels() {
    return this.prisma.musicChannel.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addChannel(
    url: string,
    artistName?: string,
    region: MusicRegion = MusicRegion.Nigeria
  ) {
    const channelId = await this.extractChannelId(url);
    if (!channelId) throw new Error('Could not extract channel ID from URL');

    const existing = await this.prisma.musicChannel.findUnique({ where: { channelId } });
    if (existing) throw new Error('Music channel already exists');

    const yt = getYoutube();
    const res = await yt.channels.list({ part: ['snippet'], id: [channelId] });
    const info = res.data.items?.[0];
    if (!info) throw new Error('Channel not found on YouTube');

    const channel = await this.prisma.musicChannel.create({
      data: {
        name: info.snippet?.title || 'Unknown Channel',
        channelId,
        url,
        artistName,
        region,
        isActive: true,
      },
    });

    this.syncChannelStats(channelId).catch(console.error);
    return channel;
  }

  async deleteChannel(id: string): Promise<void> {
    await this.prisma.musicChannel.delete({ where: { id } });
  }

  // ─── Import ────────────────────────────────────────────────────────────

  async startImport(channelId: string, batchSize = 10): Promise<string> {
    if (this.activeImports.has(channelId)) {
      return `import:${channelId}:already-running`;
    }

    const progressId = `music:import:${channelId}:${Date.now()}`;
    this.importProgress.set(progressId, {
      total: 0, processed: 0, imported: 0, skipped: 0, failed: 0,
      status: 'pending', errors: [],
    });

    this.runImport(channelId, batchSize, progressId).catch((err) => {
      const p = this.importProgress.get(progressId);
      if (p) { p.status = 'failed'; p.errors.push(err.message); }
    });

    return progressId;
  }

  getImportProgress(progressId: string): MusicImportProgress | null {
    return this.importProgress.get(progressId) ?? null;
  }

  private async runImport(
    channelId: string,
    batchSize: number,
    progressId: string,
    opts?: { maxImport?: number; maxScan?: number }
  ): Promise<void> {
    const progress = this.importProgress.get(progressId)!;
    progress.status = 'running';
    this.activeImports.add(channelId);

    try {
      const channelRecord = await this.prisma.musicChannel.findUnique({
        where: { channelId },
        select: { artistName: true, region: true },
      });

      const uploadsId = await this.getUploadsPlaylistId(channelId);
      const yt = getYoutube();
      const maxScan = opts?.maxScan ?? 200;
      const maxImport = opts?.maxImport ?? undefined;

      let pageToken: string | undefined;
      const candidates: Array<{
        youtubeId: string;
        title: string;
        description: string;
        thumbnail: string;
        publishedAt: string;
        durationSeconds: number;
      }> = [];

      // Fetch playlist pages
      do {
        const playlistRes = await yt.playlistItems.list({
          part: ['snippet', 'contentDetails'],
          playlistId: uploadsId,
          maxResults: 50,
          pageToken,
        });

        const rawItems = (playlistRes.data.items || []).filter((item) => {
          const t = item.snippet?.title || '';
          return !!item.contentDetails?.videoId && t !== 'Private video' && t !== 'Deleted video';
        });

        const videoIds = rawItems
          .map((i) => i.contentDetails?.videoId)
          .filter((id): id is string => !!id);

        if (videoIds.length === 0) { pageToken = playlistRes.data.nextPageToken || undefined; continue; }

        // Fetch durations
        const durRes = await yt.videos.list({
          part: ['contentDetails', 'snippet'],
          id: videoIds,
          maxResults: 50,
        });

        const infoMap = new Map<string, { durationSeconds: number; description: string; publishedAt: string }>();
        for (const item of durRes.data.items || []) {
          const id = item.id;
          if (!id) continue;
          const secs = durationToSeconds(item.contentDetails?.duration || '');
          infoMap.set(id, {
            durationSeconds: secs,
            description: item.snippet?.description || '',
            publishedAt: item.snippet?.publishedAt || '',
          });
        }

        // Filter to music-length videos (2-12 min)
        for (const item of rawItems) {
          const id = item.contentDetails?.videoId;
          if (!id) continue;
          const info = infoMap.get(id);
          if (!info) continue;
          if (info.durationSeconds < MIN_MUSIC_SECONDS || info.durationSeconds > MAX_MUSIC_SECONDS) continue;

          candidates.push({
            youtubeId: id,
            title: item.snippet?.title || '',
            description: info.description,
            thumbnail: item.snippet?.thumbnails?.maxres?.url
              || item.snippet?.thumbnails?.high?.url
              || item.snippet?.thumbnails?.default?.url
              || '',
            publishedAt: info.publishedAt || item.snippet?.publishedAt || '',
            durationSeconds: info.durationSeconds,
          });
        }

        pageToken = playlistRes.data.nextPageToken || undefined;

        if (candidates.length >= maxScan) break;
      } while (pageToken);

      // Check already imported
      const existingIds = new Set(
        (await this.prisma.musicVideo.findMany({
          where: { youtubeId: { in: candidates.map((c) => c.youtubeId) } },
          select: { youtubeId: true },
        })).map((v) => v.youtubeId)
      );

      const toImport = candidates
        .filter((c) => !existingIds.has(c.youtubeId))
        .slice(0, maxImport ?? candidates.length);

      progress.total = toImport.length;

      for (const vid of toImport) {
        try {
          const parsed = parseArtistTitle(vid.title);
          const artist = channelRecord?.artistName || parsed.artist;
          const artistSlug = toSlug(artist);
          const titleSlug = toSlug(parsed.title || vid.title);
          const year = vid.publishedAt ? new Date(vid.publishedAt).getFullYear() : new Date().getFullYear();
          const slug = `${artistSlug}-${titleSlug}-${year}`;

          // Check slug uniqueness — append short youtubeId suffix if needed
          const slugExists = await this.prisma.musicVideo.findUnique({ where: { slug } });
          const finalSlug = slugExists ? `${slug}-${vid.youtubeId.slice(0, 6)}` : slug;

          await this.prisma.musicVideo.create({
            data: {
              title: parsed.title || vid.title,
              slug: finalSlug,
              artist,
              artistSlug,
              featuring: parsed.featuring,
              year,
              genre: [],
              region: channelRecord?.region ?? MusicRegion.Nigeria,
              durationSeconds: vid.durationSeconds,
              youtubeId: vid.youtubeId,
              channelId,
              channelTitle: channelRecord?.artistName || channelId,
              thumbnailUrl: vid.thumbnail || null,
              hdThumbnailUrl: vid.thumbnail || null,
              isOfficial: true,
              status: 'active',
              publishedAt: vid.publishedAt ? new Date(vid.publishedAt) : null,
            },
          });

          progress.imported++;
        } catch (err) {
          progress.failed++;
          progress.errors.push(`${vid.title}: ${err instanceof Error ? err.message : String(err)}`);
        }
        progress.processed++;
      }

      progress.status = 'completed';

      // Update channel stats
      const imported = await this.prisma.musicVideo.count({ where: { channelId } });
      await this.prisma.musicChannel.update({
        where: { channelId },
        data: { importedCount: imported, lastSyncedAt: new Date() },
      });

      // Bust cache
      if (this.redis) {
        const keys = await this.redis.keys(`music:channel:${channelId}:*`);
        if (keys.length) await this.redis.del(...keys);
        await this.redis.del('music:featured');
      }

    } finally {
      this.activeImports.delete(channelId);
    }
  }

  // ─── Auto monitor (every 6h) ────────────────────────────────────────────

  async monitorAll(): Promise<void> {
    if (this.isMonitorRunning) return;
    this.isMonitorRunning = true;
    try {
      const channels = await this.prisma.musicChannel.findMany({
        where: { isActive: true },
        select: { channelId: true },
        orderBy: { lastSyncedAt: 'asc' },
      });

      for (const ch of channels) {
        if (this.activeImports.has(ch.channelId)) continue;
        try {
          const pid = `music:monitor:${ch.channelId}:${Date.now()}`;
          this.importProgress.set(pid, {
            total: 0, processed: 0, imported: 0, skipped: 0, failed: 0,
            status: 'pending', errors: [],
          });
          await this.runImport(ch.channelId, 10, pid, { maxImport: 10, maxScan: 100 });
          await this.sleep(2000);
        } catch (err) {
          console.error(`[MusicMonitor] Failed for ${ch.channelId}:`, err);
        }
      }
    } finally {
      this.isMonitorRunning = false;
    }
  }

  async bootstrapTopNigerianCatalog(): Promise<MusicBootstrapResult> {
    const result: MusicBootstrapResult = {
      skipped: false,
      channelsCreated: 0,
      channelsExisting: 0,
      importsStarted: 0,
      errors: [],
    };

    if (!process.env.YOUTUBE_API_KEY) {
      result.skipped = true;
      result.reason = 'YOUTUBE_API_KEY is not configured';
      return result;
    }

    const configuredMinVideos = Number.parseInt(process.env.MUSIC_BOOTSTRAP_MIN_VIDEOS || '80', 10);
    const minVideos = Number.isFinite(configuredMinVideos) && configuredMinVideos > 0
      ? configuredMinVideos
      : 80;

    const configuredPerChannelImport = Number.parseInt(process.env.MUSIC_BOOTSTRAP_PER_CHANNEL_IMPORT || '20', 10);
    const perChannelImport = Number.isFinite(configuredPerChannelImport) && configuredPerChannelImport > 0
      ? configuredPerChannelImport
      : 20;

    const existingVideos = await this.prisma.musicVideo.count();
    if (existingVideos >= minVideos) {
      result.skipped = true;
      result.reason = `Music catalog already has ${existingVideos} videos`;
      return result;
    }

    const lockKey = 'music:bootstrap:top-nigeria:lock';
    if (this.redis) {
      const lockSet = await this.redis.set(lockKey, String(Date.now()), 'EX', 10 * 60, 'NX');
      if (!lockSet) {
        result.skipped = true;
        result.reason = 'Bootstrap already running on another instance';
        return result;
      }
    }

    try {
      for (const source of TOP_NIGERIAN_MUSIC_SOURCES) {
        let channelId: string | null = null;

        try {
          const created = await this.addChannel(source.url, source.artistName, source.region || MusicRegion.Nigeria);
          channelId = created.channelId;
          result.channelsCreated++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.toLowerCase().includes('already exists')) {
            result.channelsExisting++;
            try {
              const resolvedChannelId = await this.extractChannelId(source.url);
              if (resolvedChannelId) channelId = resolvedChannelId;
            } catch {
              // ignore resolution failures — we'll log generic error below if still missing
            }
          } else {
            result.errors.push(`${source.artistName}: ${message}`);
          }
        }

        if (!channelId) continue;
        if (this.activeImports.has(channelId)) continue;

        const progressId = `music:bootstrap:${channelId}:${Date.now()}`;
        this.importProgress.set(progressId, {
          total: 0,
          processed: 0,
          imported: 0,
          skipped: 0,
          failed: 0,
          status: 'pending',
          errors: [],
        });

        this.runImport(channelId, 10, progressId, { maxImport: perChannelImport, maxScan: 120 }).catch((error) => {
          const progress = this.importProgress.get(progressId);
          if (progress) {
            progress.status = 'failed';
            progress.errors.push(error instanceof Error ? error.message : String(error));
          }
        });

        result.importsStarted++;
        await this.sleep(1000);
      }

      if (result.importsStarted === 0 && result.errors.length === 0) {
        result.skipped = true;
        result.reason = 'No channels were eligible for import';
      }

      return result;
    } finally {
      if (this.redis) {
        await this.redis.del(lockKey);
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  private async getUploadsPlaylistId(channelId: string): Promise<string> {
    const cacheKey = `music:channel:uploads:${channelId}`;
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return cached;
    }

    const yt = getYoutube();
    const res = await yt.channels.list({ part: ['contentDetails'], id: [channelId] });
    const uploadsId = res.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) throw new Error(`Could not resolve uploads playlist for channel ${channelId}`);

    if (this.redis) await this.redis.setex(cacheKey, this.CACHE_TTL, uploadsId);
    return uploadsId;
  }

  private async syncChannelStats(channelId: string): Promise<void> {
    try {
      const yt = getYoutube();
      const res = await yt.channels.list({ part: ['statistics'], id: [channelId] });
      const count = res.data.items?.[0]?.statistics?.videoCount;
      if (count) {
        await this.prisma.musicChannel.update({
          where: { channelId },
          data: { totalVideos: parseInt(count, 10), lastSyncedAt: new Date() },
        });
      }
    } catch (err) {
      console.error(`[MusicChannel] Stats sync failed for ${channelId}:`, err);
    }
  }

  private async extractChannelId(url: string): Promise<string | null> {
    const patterns = [
      /youtube\.com\/channel\/(UC[^/?]+)/,
      /youtube\.com\/@([^/?]+)/,
      /youtube\.com\/c\/([^/?]+)/,
      /youtube\.com\/user\/([^/?]+)/,
    ];

    for (const p of patterns) {
      const m = url.match(p);
      if (m) {
        if (m[1].startsWith('UC')) return m[1];

        // Resolve handle to channel ID
        try {
          const yt = getYoutube();
          const res = await yt.search.list({
            part: ['snippet'],
            q: m[1],
            type: ['channel'],
            maxResults: 1,
          });
          return res.data.items?.[0]?.id?.channelId ?? null;
        } catch { return null; }
      }
    }
    return null;
  }
}
