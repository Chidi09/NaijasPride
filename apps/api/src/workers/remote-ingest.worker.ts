import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Prisma, PrismaClient, Quality as PrismaQuality } from '@prisma/client';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { RemoteProvider, RemoteStreamResolverService } from '../modules/movies/remote-stream-resolver.service';

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('[RemoteIngestWorker] FATAL: REDIS_URL is required');
  process.exit(1);
}

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient();

type R2Config = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

const resolveR2Config = (): R2Config => {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const region = process.env.S3_REGION?.trim() || 'auto';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.S3_BUCKET?.trim();

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2 config is incomplete. Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET.');
  }

  return { endpoint, region, accessKeyId, secretAccessKey, bucket };
};

let r2Config: R2Config;
try {
  r2Config = resolveR2Config();
} catch (error) {
  console.error('[RemoteIngestWorker] FATAL:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const s3Client = new S3Client({
  region: r2Config.region,
  endpoint: r2Config.endpoint,
  credentials: {
    accessKeyId: r2Config.accessKeyId,
    secretAccessKey: r2Config.secretAccessKey,
  },
  forcePathStyle: true,
});

const REMOTE_INGEST_DIR = (process.env.REMOTE_INGEST_TMP_DIR || path.join(os.tmpdir(), 'naijaspride-remote-ingest')).trim();
const FFMPEG_PATH = (process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';
const STORAGE_PUBLIC_BASE_URL = (process.env.STORAGE_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || '').trim();
const REMOTE_INGEST_PACKAGE_HLS = !['0', 'false', 'no', 'off'].includes(
  (process.env.REMOTE_INGEST_PACKAGE_HLS || 'true').trim().toLowerCase()
);
const REMOTE_INGEST_WORKER_CONCURRENCY = (() => {
  const parsed = Number.parseInt(process.env.REMOTE_INGEST_WORKER_CONCURRENCY || '2', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 2;
  return Math.min(parsed, 6);
})();
const REMOTE_INGEST_STREAM_GATEWAY = !['0', 'false', 'no', 'off'].includes(
  (process.env.REMOTE_INGEST_STREAM_GATEWAY || 'true').trim().toLowerCase()
);

const deadLetterQueue = new Queue('remote-ingest-dead-letter', { connection });

const resolver = new RemoteStreamResolverService();

const toPublicUrl = (baseUrl: string, key: string): string => {
  const base = (baseUrl || '').trim().replace(/\/+$/, '');
  const normalizedKey = (key || '').trim().replace(/^\/+/, '');
  return `${base}/${normalizedKey}`;
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const collectRedisKeys = async (pattern: string): Promise<string[]> => {
  const keys: string[] = [];
  let cursor = '0';

  do {
    const [nextCursor, batch] = await connection.scan(cursor, 'MATCH', pattern, 'COUNT', '200');
    cursor = nextCursor;
    if (batch.length > 0) {
      keys.push(...batch);
    }
  } while (cursor !== '0');

  return keys;
};

const invalidateMovieCaches = async (slug?: string | null): Promise<void> => {
  try {
    const keys = new Set<string>();

    const normalizedSlug = (slug || '').trim();
    if (normalizedSlug) {
      keys.add(`movie:${normalizedSlug}`);
    }

    const searchKeys = await collectRedisKeys('search:*');
    for (const key of searchKeys) {
      keys.add(key);
    }

    if (keys.size === 0) return;

    await connection.del(...Array.from(keys));
  } catch (error) {
    console.warn(`[RemoteIngestWorker] Failed to invalidate movie cache: ${toErrorMessage(error)}`);
  }
};

const runFfmpeg = (args: string[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 16_000) {
        stderr = stderr.slice(-16_000);
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
  });
};

const toHeaderBlob = (headers: Record<string, string>): string => {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;
    lines.push(`${key}: ${value}`);
  }
  return `${lines.join('\r\n')}\r\n`;
};

const ingestSourceToMp4 = async (
  sourceUrl: string,
  outputPath: string,
  headers: Record<string, string>,
): Promise<void> => {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const sharedArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
  ];

  const headerBlob = toHeaderBlob(headers);
  if (headerBlob.trim().length > 0) {
    sharedArgs.push('-headers', headerBlob);
  }

  // First try stream copy (fast path).
  try {
    await runFfmpeg([
      ...sharedArgs,
      '-i',
      sourceUrl,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
    return;
  } catch (error) {
    console.warn(`[RemoteIngestWorker] Stream-copy failed, falling back to transcode: ${toErrorMessage(error)}`);
  }

  // Fallback transcode.
  await runFfmpeg([
    ...sharedArgs,
    '-i',
    sourceUrl,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
};

const createHlsPackage = async (inputPath: string, outputDir: string): Promise<void> => {
  await fs.promises.mkdir(outputDir, { recursive: true });

  const v720pDir = path.join(outputDir, '720p');
  const v480pDir = path.join(outputDir, '480p');
  await fs.promises.mkdir(v720pDir, { recursive: true });
  await fs.promises.mkdir(v480pDir, { recursive: true });

  await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputPath,
    '-vf',
    'scale=-2:720',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-f',
    'hls',
    '-hls_time',
    '4',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    path.join(v720pDir, 'segment_%03d.ts'),
    '-hls_base_url',
    '720p/',
    path.join(v720pDir, 'playlist.m3u8'),
  ]);

  await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputPath,
    '-vf',
    'scale=-2:480',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-f',
    'hls',
    '-hls_time',
    '4',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    path.join(v480pDir, 'segment_%03d.ts'),
    '-hls_base_url',
    '480p/',
    path.join(v480pDir, 'playlist.m3u8'),
  ]);

  const masterPlaylist = path.join(outputDir, 'master.m3u8');
  const master = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480
480p/playlist.m3u8
`;
  await fs.promises.writeFile(masterPlaylist, master);
};

const uploadFileToR2 = async (localPath: string, key: string, contentType: string): Promise<void> => {
  const fileBuffer = await fs.promises.readFile(localPath);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: r2Config.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );
};

const uploadDirectoryToR2 = async (localDir: string, baseKey: string): Promise<void> => {
  const files = await fs.promises.readdir(localDir, { recursive: true });
  for (const file of files) {
    const fullPath = path.join(localDir, file);
    const stat = await fs.promises.stat(fullPath);
    if (!stat.isFile()) continue;

    const key = path.posix.join(baseKey, file).replace(/\\/g, '/');
    const ext = path.extname(file).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.m3u8') contentType = 'application/vnd.apple.mpegurl';
    else if (ext === '.ts') contentType = 'video/mp2t';
    else if (ext === '.mp4') contentType = 'video/mp4';

    await uploadFileToR2(fullPath, key, contentType);
  }
};

type RemoteIngestJobPayload = {
  movieId: string;
  sourcePageUrl?: string;
  sourceStreamUrl?: string;
  provider?: RemoteProvider;
  referer?: string;
  headers?: Record<string, string>;
};

const worker = new Worker(
  'remote-ingest-processing',
  async (job) => {
    const payload = job.data as RemoteIngestJobPayload;
    if (!payload.movieId) {
      throw new Error('movieId is required in remote ingest job');
    }

    const provider = payload.provider || 'generic';
    let movieSlug: string | null = null;

    console.log(`[RemoteIngestWorker] Starting job ${job.id} for movie ${payload.movieId}`);

    const tempDir = path.join(REMOTE_INGEST_DIR, payload.movieId, String(Date.now()));
    const mp4Path = path.join(tempDir, 'source.mp4');

    try {
      const processingMovie = await prisma.movie.update({
        where: { id: payload.movieId },
        data: { status: 'processing' },
        select: { slug: true },
      });
      movieSlug = processingMovie.slug;
      await invalidateMovieCaches(movieSlug);

      let streamUrl = payload.sourceStreamUrl;
      let streamReferer = payload.referer;

      if (!streamUrl) {
        if (!payload.sourcePageUrl) {
          throw new Error('sourcePageUrl or sourceStreamUrl is required');
        }
        const resolved = await resolver.resolveFromPage(payload.sourcePageUrl, { provider });
        streamUrl = resolved.streamUrl;
        streamReferer = streamReferer || resolved.referer || payload.sourcePageUrl;
      }

      const requestHeaders: Record<string, string> = { ...(payload.headers || {}) };
      if (streamReferer && !requestHeaders.Referer && !requestHeaders.referer) {
        requestHeaders.Referer = streamReferer;
      }

      await ingestSourceToMp4(streamUrl, mp4Path, requestHeaders);

      const mp4Stat = await fs.promises.stat(mp4Path);
      const mp4Size = mp4Stat.size;

      const mp4Key = `movies/${payload.movieId}/remote-source.mp4`;
      await uploadFileToR2(mp4Path, mp4Key, 'video/mp4');

      let hlsKey: string | null = null;
      if (REMOTE_INGEST_PACKAGE_HLS) {
        const hlsDir = path.join(tempDir, 'hls');
        await createHlsPackage(mp4Path, hlsDir);
        const hlsBaseKey = `movies/${payload.movieId}/hls`;
        await uploadDirectoryToR2(hlsDir, hlsBaseKey);
        hlsKey = `${hlsBaseKey}/master.m3u8`;
      }

      const fileUrls: Record<string, string> = {};
      const fileSizes: Record<string, number> = {};

      fileUrls['720p'] = STORAGE_PUBLIC_BASE_URL
        ? toPublicUrl(STORAGE_PUBLIC_BASE_URL, mp4Key)
        : `/api/v1/movies/download?key=${encodeURIComponent(mp4Key)}`;
      fileSizes['720p'] = mp4Size;

      if (hlsKey) {
        // Prefer public R2 URL for direct CDN edge delivery (no proxy overhead).
        // Fall back to stream gateway when no public base URL is configured.
        if (STORAGE_PUBLIC_BASE_URL) {
          fileUrls.hls = toPublicUrl(STORAGE_PUBLIC_BASE_URL, hlsKey);
        } else if (REMOTE_INGEST_STREAM_GATEWAY) {
          fileUrls.hls = `/api/v1/movies/stream/${payload.movieId}/master.m3u8`;
        } else {
          fileUrls.hls = `/api/v1/movies/download?key=${encodeURIComponent(hlsKey)}`;
        }
      }

      const existing = await prisma.movie.findUnique({
        where: { id: payload.movieId },
        select: { metadata: true },
      });

      const existingMetadata =
        existing && typeof existing.metadata === 'object' && existing.metadata !== null
          ? (existing.metadata as Record<string, unknown>)
          : {};

      const mergedMetadata = {
        ...existingMetadata,
        remoteIngest: {
          provider,
          pageUrl: payload.sourcePageUrl || null,
          streamUrl,
          referer: streamReferer || null,
          ingestedAt: new Date().toISOString(),
        },
      };

      const activeMovie = await prisma.movie.update({
        where: { id: payload.movieId },
        data: {
          status: 'active',
          quality: [PrismaQuality.Q720p],
          fileUrls,
          fileSizes,
          metadata: mergedMetadata as Prisma.InputJsonValue,
        },
        select: { slug: true },
      });
      movieSlug = activeMovie.slug;
      await invalidateMovieCaches(movieSlug);

      console.log(`[RemoteIngestWorker] Job ${job.id} completed for movie ${payload.movieId}`);
    } catch (error) {
      console.error(`[RemoteIngestWorker] Job ${job.id} failed: ${toErrorMessage(error)}`);

      try {
        const pendingMovie = await prisma.movie.update({
          where: { id: payload.movieId },
          data: { status: 'pending' },
          select: { slug: true },
        });
        movieSlug = pendingMovie.slug;
        await invalidateMovieCaches(movieSlug);
      } catch (statusError) {
        console.error(
          `[RemoteIngestWorker] Failed to set pending status for movie ${payload.movieId}: ${toErrorMessage(statusError)}`,
        );
      }

      throw error;
    } finally {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  },
  {
    connection,
    concurrency: REMOTE_INGEST_WORKER_CONCURRENCY,
  }
);

worker.on('failed', (job, err) => {
  console.error(`[RemoteIngestWorker] Job ${job?.id} failed: ${err.message}`);
  if (!job) return;

  const configuredAttempts = typeof job.opts.attempts === 'number' && job.opts.attempts > 0 ? job.opts.attempts : 1;
  if (job.attemptsMade < configuredAttempts) {
    return;
  }

  deadLetterQueue
    .add('dead-letter', {
      queue: 'remote-ingest-processing',
      jobId: job.id,
      failedAt: Date.now(),
      attemptsMade: job.attemptsMade,
      attemptsConfigured: configuredAttempts,
      failedReason: err.message,
      payload: job.data,
    }, {
      removeOnComplete: true,
      removeOnFail: false,
    })
    .catch((error) => {
      console.error('[RemoteIngestWorker] Failed to enqueue dead-letter item:', toErrorMessage(error));
    });
});

worker.on('completed', (job) => {
  console.log(`[RemoteIngestWorker] Job ${job.id} completed`);
});

console.log('[RemoteIngestWorker] Started');
console.log(`[RemoteIngestWorker] Concurrency: ${REMOTE_INGEST_WORKER_CONCURRENCY}`);
console.log(`[RemoteIngestWorker] HLS packaging: ${REMOTE_INGEST_PACKAGE_HLS ? 'enabled' : 'disabled'}`);
console.log(`[RemoteIngestWorker] HLS stream gateway: ${REMOTE_INGEST_STREAM_GATEWAY ? 'enabled' : 'disabled'}`);
