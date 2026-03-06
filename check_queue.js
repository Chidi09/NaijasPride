const { PrismaClient } = require('@prisma/client');
const IORedis = require('ioredis');

const p = new PrismaClient();
const redis = new IORedis(process.env.REDIS_URL || 'redis://redis-green:6379');

async function main() {
  const processing = await p.movie.findMany({
    where: { status: 'processing' },
    select: { id: true, title: true, updatedAt: true },
    take: 5
  });
  
  console.log('Movies in processing status:', processing.length);
  processing.forEach(m => console.log(`  - ${m.title} (${m.id})`));
  
  // Check BullMQ queue
  const queueKeys = await redis.keys('bull:torrent-processing:*');
  console.log('\nBullMQ keys:', queueKeys);
  
  const waitLen = await redis.llen('bull:torrent-processing:wait');
  const activeLen = await redis.llen('bull:torrent-processing:active');
  const completedLen = await redis.llen('bull:torrent-processing:completed');
  const failedLen = await redis.llen('bull:torrent-processing:failed');
  
  console.log(`\nQueue stats:`);
  console.log(`  Wait: ${waitLen}`);
  console.log(`  Active: ${activeLen}`);
  console.log(`  Completed: ${completedLen}`);
  console.log(`  Failed: ${failedLen}`);
  
  await redis.disconnect();
  await p.$disconnect();
}

main().catch(console.error);
