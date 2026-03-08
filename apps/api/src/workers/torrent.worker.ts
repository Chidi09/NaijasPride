import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
// webtorrent v2+ is ESM-only — loaded via dynamic import() at runtime
let WebTorrent: any;
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

// Validate Redis connection
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('[Worker] FATAL: REDIS_URL is required');
  console.error('[Worker] Set REDIS_URL to your Redis instance (e.g., Redis Labs, Railway)');
  process.exit(1);
}

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient();

// R2 Configuration - Strict validation
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

  if (!endpoint) {
    throw new Error(
      'R2 Configuration Error: S3_ENDPOINT is required.\n' +
      'Get this from Cloudflare R2: https://dash.cloudflare.com/ > R2 > Manage R2 API Tokens'
    );
  }
  if (!accessKeyId) {
    throw new Error(
      'R2 Configuration Error: S3_ACCESS_KEY_ID is required.\n' +
      'Create an API token in Cloudflare with R2 edit permissions.'
    );
  }
  if (!secretAccessKey) {
    throw new Error(
      'R2 Configuration Error: S3_SECRET_ACCESS_KEY is required.\n' +
      'This is shown when you create the API token.'
    );
  }
  if (!bucket) {
    throw new Error(
      'R2 Configuration Error: S3_BUCKET is required.\n' +
      'Set this to your R2 bucket name (e.g., "naijaspride").'
    );
  }

  return { endpoint, region, accessKeyId, secretAccessKey, bucket };
};

// Validate R2 config at startup
let r2Config: R2Config;
try {
  r2Config = resolveR2Config();
  console.log('[Worker] R2 Configuration loaded successfully');
  console.log(`[Worker] Bucket: ${r2Config.bucket}`);
  console.log(`[Worker] Endpoint: ${r2Config.endpoint}`);
} catch (error) {
  console.error('[Worker] FATAL:', (error as Error).message);
  console.error('[Worker] Required environment variables:');
  console.error('  S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com"');
  console.error('  S3_REGION="auto"');
  console.error('  S3_BUCKET="your-bucket"');
  console.error('  S3_ACCESS_KEY_ID="your-access-key"');
  console.error('  S3_SECRET_ACCESS_KEY="your-secret-key"');
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

const parsePositiveInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(parsed, max));
};

const TORRENT_DOWNLOAD_DIR = (process.env.TORRENT_DOWNLOAD_DIR || path.join(os.tmpdir(), 'naijaspride-downloads')).trim();
// Minimum free bytes required before accepting a torrent job (default 15 GB)
const TORRENT_MIN_FREE_BYTES = parsePositiveInt(
  process.env.TORRENT_MIN_FREE_DISK_GB ? String(Math.round(Number(process.env.TORRENT_MIN_FREE_DISK_GB) * 1024 * 1024 * 1024)) : undefined,
  15 * 1024 * 1024 * 1024,
  1 * 1024 * 1024 * 1024,
  200 * 1024 * 1024 * 1024
);

const getFreeDiskBytes = (): Promise<number> => {
  return new Promise((resolve) => {
    // statfs is available in Node 18+; fall back to 0 (always-pass) on error
    fs.promises.statfs(TORRENT_DOWNLOAD_DIR).then((s) => {
      resolve(s.bavail * s.bsize);
    }).catch(() => resolve(0));
  });
};

const TORRENT_REMUX_MKV = !['0', 'false', 'no', 'off'].includes(
  (process.env.TORRENT_REMUX_MKV || 'true').trim().toLowerCase()
);
const TORRENT_TRANSCODE_MKV = !['0', 'false', 'no', 'off'].includes(
  (process.env.TORRENT_TRANSCODE_MKV || 'true').trim().toLowerCase()
);
const TORRENT_PACKAGE_HLS = !['0', 'false', 'no', 'off'].includes(
  (process.env.TORRENT_PACKAGE_HLS || 'true').trim().toLowerCase()
);
const FFMPEG_PATH = (process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';
const FFPROBE_PATH = (process.env.FFPROBE_PATH || 'ffprobe').trim() || 'ffprobe';
const STORAGE_PUBLIC_BASE_URL = (process.env.STORAGE_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || '').trim();
const TORRENT_WORKER_CONCURRENCY = parsePositiveInt(process.env.TORRENT_WORKER_CONCURRENCY, 2, 1, 4);
const TORRENT_JOB_TIMEOUT_MS = parsePositiveInt(process.env.TORRENT_JOB_TIMEOUT_MS, 60 * 60 * 1000, 5 * 60 * 1000, 4 * 60 * 60 * 1000);

const toPublicUrl = (baseUrl: string, key: string): string => {
  const base = (baseUrl || '').trim().replace(/\/+$/, '');
  const k = (key || '').trim().replace(/^\/+/, '');
  return `${base}/${k}`;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const collectRedisKeys = async (pattern: string): Promise<string[]> => {
  const keys: string[] = [];
  let cursor = '0';

  do {
    const [nextCursor, batch] = await connection.scan(cursor, 'MATCH', pattern, 'COUNT', '200');
    cursor = nextCursor;
    if (batch.length > 0) keys.push(...batch);
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
    console.warn(`[Worker] Cache invalidation failed: ${getErrorMessage(error)}`);
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

type FfprobeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
};

type FfprobeResult = {
  streams?: FfprobeStream[];
};

type MkvRemuxPlan = {
  canRemux: boolean;
  reason: string;
  videoCodec: string | null;
  audioCodec: string | null;
  mapArgs: string[];
};

const runFfprobe = (inputPath: string): Promise<FfprobeResult> => {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFPROBE_PATH, [
      '-v',
      'error',
      '-show_entries',
      'stream=index,codec_type,codec_name',
      '-of',
      'json',
      inputPath,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 128_000) {
        stdout = stdout.slice(-128_000);
      }
    });

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
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout || '{}') as FfprobeResult;
        resolve(parsed);
      } catch (error) {
        reject(new Error(`ffprobe returned invalid JSON: ${getErrorMessage(error)}`));
      }
    });
  });
};

const chooseMkvRemuxPlan = (probe: FfprobeResult): MkvRemuxPlan => {
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find((stream) => (stream.codec_type || '').toLowerCase() === 'video');
  const audioStreams = streams.filter((stream) => (stream.codec_type || '').toLowerCase() === 'audio');

  const videoCodec = (video?.codec_name || '').toLowerCase() || null;
  if (!video || !Number.isFinite(video.index as number)) {
    return {
      canRemux: false,
      reason: 'missing video stream',
      videoCodec,
      audioCodec: null,
      mapArgs: [],
    };
  }

  // Keep remux strict for broad browser support.
  const browserSafeVideoCodecs = new Set(['h264']);
  const browserSafeAudioCodecs = new Set(['aac', 'mp3']);

  if (!videoCodec || !browserSafeVideoCodecs.has(videoCodec)) {
    return {
      canRemux: false,
      reason: `unsupported video codec: ${videoCodec || 'unknown'}`,
      videoCodec,
      audioCodec: null,
      mapArgs: [],
    };
  }

  const compatibleAudio = audioStreams.find((stream) =>
    browserSafeAudioCodecs.has((stream.codec_name || '').toLowerCase())
  );

  if (audioStreams.length > 0 && !compatibleAudio) {
    return {
      canRemux: false,
      reason: `no browser-safe audio stream (found: ${audioStreams
        .map((stream) => stream.codec_name || 'unknown')
        .join(', ')})`,
      videoCodec,
      audioCodec: null,
      mapArgs: [],
    };
  }

  const mapArgs = ['-map', '0:v:0'];
  let audioCodec: string | null = null;
  if (compatibleAudio && Number.isFinite(compatibleAudio.index as number)) {
    mapArgs.push('-map', `0:${compatibleAudio.index as number}`);
    audioCodec = (compatibleAudio.codec_name || '').toLowerCase() || null;
  }

  return {
    canRemux: true,
    reason: 'browser-compatible codecs',
    videoCodec,
    audioCodec,
    mapArgs,
  };
};

const remuxMkvToMp4 = async (inputPath: string, outputPath: string, mapArgs: string[]): Promise<void> => {
  const outDir = path.dirname(outputPath);
  await fs.promises.mkdir(outDir, { recursive: true });

  await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputPath,
    ...mapArgs,
    '-dn',
    '-sn',
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    outputPath,
  ]);
};

const transcodeMkvToMp4 = async (inputPath: string, outputPath: string): Promise<void> => {
  const outDir = path.dirname(outputPath);
  await fs.promises.mkdir(outDir, { recursive: true });

  await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-dn',
    '-sn',
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

const createHlsPackage = async (
  inputPath: string,
  outputDir: string,
  baseName: string
): Promise<{ masterKey: string; variants: string[] }> => {
  await fs.promises.mkdir(outputDir, { recursive: true });

  const masterPlaylist = path.join(outputDir, 'master.m3u8');

  // Create multi-quality HLS
  // 720p variant
  const v720pDir = path.join(outputDir, '720p');
  await fs.promises.mkdir(v720pDir, { recursive: true });
  const v720pPlaylist = path.join(v720pDir, 'playlist.m3u8');

  // 480p variant
  const v480pDir = path.join(outputDir, '480p');
  await fs.promises.mkdir(v480pDir, { recursive: true });
  const v480pPlaylist = path.join(v480pDir, 'playlist.m3u8');

  // Generate 720p
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
    v720pPlaylist,
  ]);

  // Generate 480p
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
    v480pPlaylist,
  ]);

  // Create master playlist
  const masterContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480
480p/playlist.m3u8
`;
  await fs.promises.writeFile(masterPlaylist, masterContent);

  return {
    masterKey: 'master.m3u8',
    variants: ['720p/playlist.m3u8', '480p/playlist.m3u8'],
  };
};

const uploadFileToR2 = async (
  localPath: string,
  key: string,
  contentType: string
): Promise<void> => {
  // Stream the file rather than reading it all into RAM — avoids OOM on large video files.
  const stat = await fs.promises.stat(localPath);
  const stream = fs.createReadStream(localPath);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: r2Config.bucket,
      Key: key,
      Body: stream,
      ContentType: contentType,
      ContentLength: stat.size,
    })
  );
};

const uploadStreamToR2 = async (
  source: Readable,
  key: string,
  contentType: string,
  size?: number,
): Promise<void> => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: r2Config.bucket,
      Key: key,
      Body: source,
      ContentType: contentType,
      ...(Number.isFinite(size) && (size as number) > 0 ? { ContentLength: size as number } : {}),
    })
  );
};

const uploadDirectoryToR2 = async (
  localDir: string,
  baseKey: string
): Promise<void> => {
  const files = await fs.promises.readdir(localDir, { recursive: true });

  for (const file of files) {
    const fullPath = path.join(localDir, file);
    const stat = await fs.promises.stat(fullPath);

    if (stat.isFile()) {
      const key = path.posix.join(baseKey, file).replace(/\\/g, '/');
      const ext = path.extname(file).toLowerCase();

      let contentType = 'application/octet-stream';
      if (ext === '.m3u8') contentType = 'application/vnd.apple.mpegurl';
      else if (ext === '.ts') contentType = 'video/mp2t';
      else if (ext === '.mp4') contentType = 'video/mp4';

      await uploadFileToR2(fullPath, key, contentType);
    }
  }
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
};

// Download a torrent and process the video for streaming
const downloadAndProcess = async (magnetLink: string, movieId: string): Promise<{
  mp4Key: string | null;
  hlsKey: string | null;
  mp4Size: number;
}> => {
  // Lazy-load webtorrent (ESM-only module)
  if (!WebTorrent) {
    const mod = await dynamicImport('webtorrent');
    WebTorrent = mod.default ?? mod;
  }

  return new Promise((resolve, reject) => {
    const client = new WebTorrent();
    let settled = false;

    const safeResolve = (value: { mp4Key: string | null; hlsKey: string | null; mp4Size: number }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const safeReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    client.add(magnetLink, { path: TORRENT_DOWNLOAD_DIR }, (torrent: any) => {
      void (async () => {
        console.log(`[Worker] Torrent metadata fetched: ${torrent.name}`);

        const jobKey = String(torrent.infoHash || movieId);

        const cleanupPaths = [
          path.join(TORRENT_DOWNLOAD_DIR, String(torrent.infoHash || '')),
          path.join(TORRENT_DOWNLOAD_DIR, String(torrent.name || '')),
          path.join(TORRENT_DOWNLOAD_DIR, '_transcode', jobKey),
          path.join(TORRENT_DOWNLOAD_DIR, '_hls', jobKey),
        ].filter((value) => value && value !== TORRENT_DOWNLOAD_DIR);

        const finalize = async () => {
          try {
            client.destroy();
          } catch {
            // ignore
          }

          await Promise.all(
            cleanupPaths.map(async (p) => {
              try {
                await fs.promises.rm(p, { recursive: true, force: true });
              } catch {
                // ignore
              }
            })
          );
        };

        try {
          const videoFiles = (torrent.files || []).filter(
            (f: any) => typeof f?.name === 'string' && /\.(mp4|mkv|avi|mov)$/i.test(f.name)
          );
          const mp4Files = videoFiles.filter((f: any) => /\.mp4$/i.test(f.name));
          const candidates = (mp4Files.length > 0 ? mp4Files : videoFiles).sort(
            (a: any, b: any) => Number(b?.length || 0) - Number(a?.length || 0)
          );
          const file = candidates[0];
          if (!file) {
            throw new Error('No video file found in torrent');
          }

          const safeName = (() => {
            const base = path.basename(String(file.name || 'video'));
            const cleaned = base
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9._-]/gi, '-');
            return cleaned.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'video';
          })();

          const baseName = safeName.replace(/\.[^.]+$/, '');
          const isMkv = safeName.toLowerCase().endsWith('.mkv');

          const transcodeDir = path.join(TORRENT_DOWNLOAD_DIR, '_transcode', jobKey);
          await fs.promises.mkdir(transcodeDir, { recursive: true });

          // Download to disk for processing
          const inputPath = path.join(transcodeDir, safeName);
          console.log(`[Worker] Downloading ${file.name} (${(file.length / 1024 / 1024).toFixed(1)} MB)...`);
          await pipeline(file.createReadStream(), fs.createWriteStream(inputPath));

          let mp4Path = inputPath;
          let mp4Key = `movies/${movieId}/${baseName}.mp4`;

          // For MKV: remux first (fast path), transcode only when required.
          if (isMkv) {
            const outputPath = path.join(transcodeDir, `${baseName}.mp4`);
            let remuxPlan: MkvRemuxPlan | null = null;

            if (TORRENT_REMUX_MKV) {
              try {
                const probe = await runFfprobe(inputPath);
                remuxPlan = chooseMkvRemuxPlan(probe);
                console.log(
                  `[Worker] MKV probe: video=${remuxPlan.videoCodec || 'unknown'}, audio=${remuxPlan.audioCodec || 'none'}, canRemux=${remuxPlan.canRemux} (${remuxPlan.reason})`
                );
              } catch (error) {
                console.warn(`[Worker] ffprobe failed: ${getErrorMessage(error)}`);
              }
            }

            if (TORRENT_REMUX_MKV && remuxPlan?.canRemux) {
              console.log('[Worker] Remuxing MKV to MP4 (stream copy)...');
              try {
                await remuxMkvToMp4(inputPath, outputPath, remuxPlan.mapArgs);
                mp4Path = outputPath;
                console.log('[Worker] MKV remux complete');
              } catch (error) {
                console.warn(`[Worker] MKV remux failed: ${getErrorMessage(error)}`);
                remuxPlan = { ...remuxPlan, canRemux: false, reason: 'ffmpeg remux failed' };
              }
            }

            if (mp4Path === inputPath) {
              if (!TORRENT_TRANSCODE_MKV) {
                throw new Error(
                  `Cannot produce browser-safe MP4 from MKV (${remuxPlan?.reason || 'unknown reason'}) and transcode fallback is disabled.`
                );
              }

              console.log('[Worker] Transcoding MKV to MP4 (fallback)...');
              await transcodeMkvToMp4(inputPath, outputPath);
              mp4Path = outputPath;
              console.log('[Worker] MKV transcode fallback complete');
            }
          }

          // Get MP4 file stats
          const mp4Stat = await fs.promises.stat(mp4Path);
          const mp4Size = mp4Stat.size;

          // Upload MP4
          console.log(`[Worker] Uploading MP4 to R2...`);
          await uploadFileToR2(mp4Path, mp4Key, 'video/mp4');
          console.log(`[Worker] MP4 uploaded: ${mp4Key}`);

          let hlsKey: string | null = null;

          // Create HLS package if enabled
          if (TORRENT_PACKAGE_HLS) {
            const hlsDir = path.join(TORRENT_DOWNLOAD_DIR, '_hls', jobKey);
            console.log(`[Worker] Creating HLS package...`);

            try {
              await createHlsPackage(mp4Path, hlsDir, baseName);

              // Upload HLS files
              const hlsBaseKey = `movies/${movieId}/hls`;
              await uploadDirectoryToR2(hlsDir, hlsBaseKey);

              hlsKey = `${hlsBaseKey}/master.m3u8`;
              console.log(`[Worker] HLS package uploaded: ${hlsKey}`);
            } catch (error) {
              console.error(`[Worker] HLS packaging failed: ${getErrorMessage(error)}`);
              // Continue without HLS - MP4 is the fallback
            }
          }

          await finalize();
          safeResolve({ mp4Key, hlsKey, mp4Size });
        } catch (error) {
          await finalize();
          safeReject(error);
        }
      })();
    });

    client.on('error', (err: any) => {
      console.error(`[Worker] WebTorrent Error: ${getErrorMessage(err)}`);
      try {
        client.destroy();
      } catch {
        // ignore
      }
      safeReject(err);
    });
  });
};

const worker = new Worker(
  'torrent-processing',
  async (job) => {
    console.log(`[Worker] Starting Job ${job.id}`);
    const { magnetLink, movieId } = job.data as { magnetLink: string; movieId: string };
    let movieSlug: string | null = null;

    // Disk-space guard: refuse to start if free space is below threshold.
    // This prevents disk-full cascades that corrupt Redis AOF and stall all workers.
    const freeBytes = await getFreeDiskBytes();
    const freeGB = (freeBytes / 1024 / 1024 / 1024).toFixed(1);
    if (freeBytes > 0 && freeBytes < TORRENT_MIN_FREE_BYTES) {
      const requiredGB = (TORRENT_MIN_FREE_BYTES / 1024 / 1024 / 1024).toFixed(1);
      console.warn(`[Worker] Job ${job.id} SKIPPED — only ${freeGB} GB free, need ${requiredGB} GB. Job will be retried later.`);
      // Throw a non-fatal error so BullMQ retries after backoff rather than marking failed.
      throw Object.assign(new Error(`Insufficient disk space: ${freeGB} GB free, need ${requiredGB} GB`), { skipMovie: true });
    }
    console.log(`[Worker] Job ${job.id} — disk free: ${freeGB} GB`);

    try {
      const processingMovie = await prisma.movie.update({
        where: { id: movieId },
        data: { status: 'processing' },
        select: { slug: true },
      });
      movieSlug = processingMovie.slug;
      await invalidateMovieCaches(movieSlug);

      const { mp4Key, hlsKey, mp4Size } = await withTimeout(
        downloadAndProcess(magnetLink, movieId),
        TORRENT_JOB_TIMEOUT_MS,
        `torrent job ${job.id}`,
      );

      const fileUrls: Record<string, string> = {};
      const fileSizes: Record<string, number> = {};

      if (mp4Key) {
        const mp4Url = STORAGE_PUBLIC_BASE_URL
          ? toPublicUrl(STORAGE_PUBLIC_BASE_URL, mp4Key)
          : `/api/v1/movies/download?key=${encodeURIComponent(mp4Key)}`;
        fileUrls['720p'] = mp4Url;
        fileSizes['720p'] = mp4Size;
      }

      if (hlsKey) {
        const hlsUrl = STORAGE_PUBLIC_BASE_URL
          ? toPublicUrl(STORAGE_PUBLIC_BASE_URL, hlsKey)
          : `/api/v1/movies/download?key=${encodeURIComponent(hlsKey)}`;
        fileUrls['hls'] = hlsUrl;
      }

      const activeMovie = await prisma.movie.update({
        where: { id: movieId },
        data: {
          status: 'active',
          fileUrls,
          fileSizes: Object.keys(fileSizes).length > 0 ? fileSizes : undefined,
        },
        select: { slug: true },
      });
      movieSlug = activeMovie.slug;
      await invalidateMovieCaches(movieSlug);

      console.log(`[Worker] Job ${job.id} SUCCESS`);
      console.log(`[Worker]   MP4: ${mp4Key || 'N/A'}`);
      console.log(`[Worker]   HLS: ${hlsKey || 'N/A'}`);
    } catch (error: unknown) {
      console.error(`[Worker] Job ${job.id} FAILED: ${getErrorMessage(error)}`);
      // If this is a disk-space skip, the movie was never set to 'processing' — don't touch it.
      if ((error as any)?.skipMovie) {
        throw error;
      }
      const pendingMovie = await prisma.movie.update({
        where: { id: movieId },
        data: { status: 'pending' },
        select: { slug: true },
      });
      movieSlug = pendingMovie.slug;
      await invalidateMovieCaches(movieSlug);
      throw error;
    }
  },
  {
    connection,
    concurrency: TORRENT_WORKER_CONCURRENCY,
    lockDuration: 30 * 60 * 1000,       // 30 minutes — torrent downloads can be very slow
    stalledInterval: 10 * 60 * 1000,     // Check for stalled jobs every 10 minutes
    maxStalledCount: 2,                  // Allow 2 stall events before failing the job
  }
);

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

console.log('[Worker] Torrent worker started');
console.log(`[Worker] Concurrency: ${TORRENT_WORKER_CONCURRENCY}`);
console.log(`[Worker] Job timeout: ${TORRENT_JOB_TIMEOUT_MS}ms`);
console.log(`[Worker] HLS Packaging: ${TORRENT_PACKAGE_HLS ? 'enabled' : 'disabled'}`);
console.log(`[Worker] MKV Remuxing: ${TORRENT_REMUX_MKV ? 'enabled' : 'disabled'}`);
console.log(`[Worker] MKV Transcode fallback: ${TORRENT_TRANSCODE_MKV ? 'enabled' : 'disabled'}`);
console.log(`[Worker] Download directory: ${TORRENT_DOWNLOAD_DIR}`);

// Pre-create required subdirectories at startup so they are owned by appuser.
// If the Docker volume is recreated (owned by root), mkdir here will fail and
// we surface the error immediately rather than per-job.
void (async () => {
  try {
    await fs.promises.mkdir(path.join(TORRENT_DOWNLOAD_DIR, '_transcode'), { recursive: true });
    await fs.promises.mkdir(path.join(TORRENT_DOWNLOAD_DIR, '_hls'), { recursive: true });
    console.log('[Worker] Download subdirectories ready');
  } catch (err) {
    console.error('[Worker] FATAL: Cannot create download subdirectories:', (err as Error).message);
    console.error('[Worker] Fix: chown the torrent volume to uid 1001 and restart the worker.');
    process.exit(1);
  }
})();

// ── Startup Pending Backfill ────────────────────────────────────────────────
// On every worker startup, scan for any `pending` downloadable movies in DB
// that are NOT already in the Redis queue and re-enqueue them.
// This recovers orphaned records after deploys, crashes, or queue flushes.
void (async () => {
  // Wait for directories + short grace period before scanning
  await new Promise(resolve => setTimeout(resolve, 5000));

  const BACKFILL_BATCH = parsePositiveInt(process.env.TORRENT_BACKFILL_BATCH, 50, 1, 500);
  const attemptsRaw = Number.parseInt(process.env.TORRENT_JOB_ATTEMPTS || '3', 10);
  const attempts = Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? Math.min(attemptsRaw, 5) : 3;
  const backoffMs = 120_000;

  try {
    const queue = new Queue('torrent-processing', { connection: new IORedis(REDIS_URL!, { maxRetriesPerRequest: null }) });

    // Get all job IDs currently in queue (wait + active) to avoid duplicates
    const [waitJobs, activeJobs] = await Promise.all([
      queue.getWaiting(0, 10000),
      queue.getActive(0, 200),
    ]);
    const queuedMovieIds = new Set<string>([
      ...waitJobs.map(j => (j.data as any).movieId as string),
      ...activeJobs.map(j => (j.data as any).movieId as string),
    ].filter(Boolean));

    // Find pending movies not already in queue, ordered oldest-first
    const pendingMovies = await prisma.movie.findMany({
      where: {
        isStreamOnly: false,
        status: 'pending',
        id: { notIn: Array.from(queuedMovieIds) },
        metadata: { path: ['sourceInfoHash'], not: null },
      },
      select: { id: true, title: true, metadata: true },
      orderBy: { createdAt: 'asc' },
      take: BACKFILL_BATCH,
    });

    if (pendingMovies.length === 0) {
      console.log('[Worker] Startup backfill: no orphaned pending movies found');
      await queue.close();
      return;
    }

    console.log(`[Worker] Startup backfill: re-queuing ${pendingMovies.length} orphaned pending movies`);
    let enqueued = 0;
    for (const movie of pendingMovies) {
      const infoHash = (movie.metadata as any)?.sourceInfoHash as string | undefined;
      const rawTitle = (movie.metadata as any)?.sourceRawTitle ?? movie.title;
      if (!infoHash) continue;
      const magnetLink = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(rawTitle)}`;
      await queue.add('download-torrent', {
        magnetLink,
        movieId: movie.id,
        timestamp: Date.now(),
      }, {
        removeOnComplete: true,
        removeOnFail: false,
        attempts,
        backoff: { type: 'exponential', delay: backoffMs },
      });
      enqueued++;
    }
    console.log(`[Worker] Startup backfill: enqueued ${enqueued} movies`);
    await queue.close();
  } catch (err) {
    console.error('[Worker] Startup backfill failed (non-fatal):', (err as Error).message);
  }
})();
