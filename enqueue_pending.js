const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const p = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL || 'redis://redis-green:6379', {
  maxRetriesPerRequest: null,
});

const torrentQueue = new Queue('torrent-processing', { connection });

async function main() {
  const pending = await p.movie.findMany({
    where: { 
      status: 'pending',
      AND: [
        { downloadUrl: { not: null } },
        { NOT: { downloadUrl: { startsWith: 'magnet:' } } },
      ]
    },
    select: { id: true, title: true, downloadUrl: true },
    take: 100
  });
  
  console.log(`Found ${pending.length} pending movies to enqueue`);
  
  let enqueued = 0;
  for (const movie of pending) {
    try {
      await torrentQueue.add(
        'process-torrent',
        { movieId: movie.id, magnetLink: movie.downloadUrl },
        { 
          jobId: `torrent-${movie.id}`,
          removeOnComplete: true,
          removeOnFail: false 
        }
      );
      enqueued++;
      console.log(`Enqueued: ${movie.title}`);
    } catch (err) {
      if (!/already exists/i.test(err.message)) {
        console.error(`Failed to enqueue ${movie.title}:`, err.message);
      }
    }
  }
  
  console.log(`\nEnqueued ${enqueued} jobs`);
  
  await torrentQueue.close();
  await connection.disconnect();
  await p.$disconnect();
}

main().catch(console.error);
