import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import WebTorrent from 'webtorrent';
import { Storage } from '@google-cloud/storage';
import * as path from 'node:path';
import * as fs from 'node:fs';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient();
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'naijaspride-media';

// Download a torrent and stream the main video file directly to GCS.
const downloadAndUpload = (magnetLink: string, movieId: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const client = new WebTorrent();

    client.add(magnetLink, { path: '/tmp/downloads' }, (torrent) => {
      console.log(`[Worker] Torrent metadata fetched: ${torrent.name}`);

      const file = torrent.files.find((f) => f.name.endsWith('.mp4') || f.name.endsWith('.mkv'));
      if (!file) {
        client.destroy();
        return reject(new Error('No video file found in torrent'));
      }

      console.log(`[Worker] Downloading ${file.name}...`);

      const gcsFileName = `movies/${movieId}/${file.name}`;
      const blob = storage.bucket(bucketName).file(gcsFileName);

      const blobStream = blob.createWriteStream({
        resumable: false,
        gzip: true,
        metadata: {
          contentType: file.name.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4',
        },
      });

      file
        .createReadStream()
        .pipe(blobStream)
        .on('error', (err) => {
          console.error(`[Worker] GCS Upload Error: ${err.message}`);
          client.destroy();
          reject(err);
        })
        .on('finish', async () => {
          console.log(`[Worker] Upload complete: ${gcsFileName}`);

          // Clean up any buffered tmp files
          const torrentPath = path.join('/tmp/downloads', torrent.infoHash);
          if (fs.existsSync(torrentPath)) {
            fs.rm(torrentPath, { recursive: true, force: true }, () => {});
          }

          client.destroy();
          resolve(gcsFileName);
        });
    });

    client.on('error', (err) => {
      console.error(`[Worker] WebTorrent Error: ${err.message}`);
      client.destroy();
      reject(err);
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

      const gcsPath = await downloadAndUpload(magnetLink, movieId);

      await prisma.movie.update({
        where: { id: movieId },
        data: {
          status: 'active',
          fileUrls: {
            '720p': `https://storage.googleapis.com/${bucketName}/${gcsPath}`,
          },
        },
      });

      console.log(`[Worker] Job ${job.id} SUCCESS`);
    } catch (error: any) {
      console.error(`[Worker] Job ${job.id} FAILED: ${error.message}`);
      await prisma.movie.update({
        where: { id: movieId },
        data: { status: 'pending' },
      });
    }
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});
