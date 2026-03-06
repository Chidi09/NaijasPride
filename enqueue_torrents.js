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
      status: 'pending'
    },
    select: { id: true, title: true, metadata: true },
    take: 100
  });
  
  console.log(`Found ${pending.length} pending movies`);
  
  let enqueued = 0;
  for (const movie of pending) {
    const metadata = movie.metadata || {};
    const magnetLink = metadata.magnetLink || metadata.infoHash ? 
      `magnet:?xt=urn:btih:${metadata.infoHash}&dn=${encodeURIComponent(movie.title)}` : null;
    
    if (!magnetLink) {
      console.log(`Skipping ${movie.title}: no magnet/infoHash`);
      continue;
    }
    
    try {
      await torrentQueue.add(
        'download-torrent',
        { movieId: movie.id, magnetLink, timestamp: Date.now() },
        { 
          removeOnComplete: true,
          removeOnFail: false 
        }
      );
      enqueued++;
      console.log(`Enqueued: ${movie.title}`);
    } catch (err) {
      if (!/already exists/i.test(err.message)) {
        console.error(`Failed ${movie.title}:`, err.message);
      }
    }
  }
  
  console.log(`\nEnqueued ${enqueued} jobs`);
  
  await torrentQueue.close();
  await connection.disconnect();
  await p.$disconnect();
}

main().catch(console.error);
