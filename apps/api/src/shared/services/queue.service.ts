import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export const torrentQueue = new Queue('torrent-processing', { connection });

export class QueueService {
  async addTorrentJob(magnetLink: string, movieId: string) {
    await torrentQueue.add('download-torrent', {
      magnetLink,
      movieId,
      timestamp: Date.now(),
    });
    console.log(`[Queue] Added job for movie ${movieId}`);
  }
}
