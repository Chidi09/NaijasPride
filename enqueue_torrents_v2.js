const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const p = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL || 'redis://redis-green:6379', {
  maxRetriesPerRequest: null,
});

const torrentQueue = new Queue('torrent-processing', { connection });

function buildMagnetLink(infoHash, title) {
  const hash = infoHash.toUpperCase();
  const dn = encodeURIComponent(title || 'Unknown');
  return `magnet:?xt=urn:btih:${hash}&dn=${dn}`;
}

async function main() {
  const pending = await p.movie.findMany({
    where: { 
      status: 'pending',
      metadata: { not: null }
    },
    select: { id: true, title: true, metadata: true },
    take: 150
  });
  
  console.log(`Found ${pending.length} pending movies with metadata`);
  
  let enqueued = 0;
  for (const movie of pending) {
    const metadata = movie.metadata || {};
    const infoHash = metadata.sourceInfoHash;
    
    if (!infoHash) {
      console.log(`Skipping ${movie.title}: no sourceInfoHash`);
      continue;
    }
    
    const magnetLink = buildMagnetLink(infoHash, movie.title);
    
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
      if (enqueued % 10 === 0) {
        console.log(`Enqueued ${enqueued}...`);
      }
    } catch (err) {
      if (!/already exists/i.test(err.message)) {
        console.error(`Failed ${movie.title}:`, err.message);
      }
    }
  }
  
  console.log(`\nTotal enqueued: ${enqueued} jobs`);
  
  await torrentQueue.close();
  await connection.disconnect();
  await p.$disconnect();
}

main().catch(console.error);
