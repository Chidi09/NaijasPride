import { Worker } from 'bullmq';
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

const TORRENT_DOWNLOAD_DIR = (process.env.TORRENT_DOWNLOAD_DIR || path.join(os.tmpdir(), 'naijaspride-downloads')).trim();
const TORRENT_TRANSCODE_MKV = !['0', 'false', 'no', 'off'].includes(
  (process.env.TORRENT_TRANSCODE_MKV || '').trim().toLowerCase()
);
const TORRENT_PACKAGE_HLS = !['0', 'false', 'no', 'off'].includes(
  (process.env.TORRENT_PACKAGE_HLS || 'true').trim().toLowerCase()
);
const FFMPEG_PATH = (process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';
const STORAGE_PUBLIC_BASE_URL = (process.env.STORAGE_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || '').trim();

const toPublicUrl = (baseUrl: string, key: string): string => {
  const base = (baseUrl || '').trim().replace(/\/+$/, '');
  const k = (key || '').trim().replace(/^\/+/, '');
  return `${base}/${k}`;
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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

        const cleanupPaths = [
          path.join(TORRENT_DOWNLOAD_DIR, String(torrent.infoHash || '')),
          path.join(TORRENT_DOWNLOAD_DIR, String(torrent.name || '')),
          path.join(TORRENT_DOWNLOAD_DIR, '_transcode', String(torrent.infoHash || '')),
          path.join(TORRENT_DOWNLOAD_DIR, '_hls', String(torrent.infoHash || '')),
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

          const transcodeDir = path.join(TORRENT_DOWNLOAD_DIR, '_transcode', String(torrent.infoHash || movieId));
          await fs.promises.mkdir(transcodeDir, { recursive: true });

          // Download to disk for processing
          const inputPath = path.join(transcodeDir, safeName);
          console.log(`[Worker] Downloading ${file.name} (${(file.length / 1024 / 1024).toFixed(1)} MB)...`);
          await pipeline(file.createReadStream(), fs.createWriteStream(inputPath));

          let mp4Path = inputPath;
          let mp4Key = `movies/${movieId}/${baseName}.mp4`;

          // Transcode MKV to MP4 if needed
          if (isMkv && TORRENT_TRANSCODE_MKV) {
            const outputPath = path.join(transcodeDir, `${baseName}.mp4`);
            console.log(`[Worker] Transcoding MKV to MP4...`);
            try {
              await transcodeMkvToMp4(inputPath, outputPath);
              mp4Path = outputPath;
              console.log(`[Worker] Transcoding complete`);
            } catch (error) {
              console.error(`[Worker] Transcode failed, using original: ${getErrorMessage(error)}`);
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
            const hlsDir = path.join(TORRENT_DOWNLOAD_DIR, '_hls', String(torrent.infoHash || movieId));
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

    try {
      await prisma.movie.update({
        where: { id: movieId },
        data: { status: 'processing' },
      });

      const { mp4Key, hlsKey, mp4Size } = await downloadAndProcess(magnetLink, movieId);

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

      await prisma.movie.update({
        where: { id: movieId },
        data: {
          status: 'active',
          fileUrls,
          fileSizes: Object.keys(fileSizes).length > 0 ? fileSizes : undefined,
        },
      });

      console.log(`[Worker] Job ${job.id} SUCCESS`);
      console.log(`[Worker]   MP4: ${mp4Key || 'N/A'}`);
      console.log(`[Worker]   HLS: ${hlsKey || 'N/A'}`);
    } catch (error: unknown) {
      console.error(`[Worker] Job ${job.id} FAILED: ${getErrorMessage(error)}`);
      await prisma.movie.update({
        where: { id: movieId },
        data: { status: 'pending' },
      });
      throw error;
    }
  },
  {
    connection,
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
console.log(`[Worker] HLS Packaging: ${TORRENT_PACKAGE_HLS ? 'enabled' : 'disabled'}`);
console.log(`[Worker] MKV Transcoding: ${TORRENT_TRANSCODE_MKV ? 'enabled' : 'disabled'}`);
console.log(`[Worker] Download directory: ${TORRENT_DOWNLOAD_DIR}`);
