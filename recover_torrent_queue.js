const { PrismaClient } = require('@prisma/client');
const IORedis = require('ioredis');
const { Queue } = require('bullmq');

const prisma = new PrismaClient();

function buildMagnetLink(infoHash, title) {
  return `magnet:?xt=urn:btih:${String(infoHash).toUpperCase()}&dn=${encodeURIComponent(title || 'movie')}`;
}

async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://redis-green:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('torrent-processing', { connection });

  // 1) Reset stuck processing movies back to pending
  const reset = await prisma.movie.updateMany({
    where: { status: 'processing' },
    data: { status: 'pending' },
  });
  console.log('reset_processing_to_pending:', reset.count);

  // 2) Clear queue states (jobs can be safely recreated from DB)
  await queue.drain(true);
  await queue.clean(0, 10000, 'wait');
  await queue.clean(0, 10000, 'active');
  await queue.clean(0, 10000, 'delayed');
  await queue.clean(0, 10000, 'failed');
  await queue.clean(0, 10000, 'completed');

  // 3) Re-enqueue pending movies with sourceInfoHash
  const pending = await prisma.movie.findMany({
    where: { status: 'pending', metadata: { not: null } },
    select: { id: true, title: true, metadata: true },
    take: 200,
  });

  let enqueued = 0;
  for (const m of pending) {
    const infoHash = m?.metadata?.sourceInfoHash;
    if (!infoHash) continue;

    const magnetLink = buildMagnetLink(infoHash, m.title);
    await queue.add(
      'download-torrent',
      { movieId: m.id, magnetLink, timestamp: Date.now() },
      { removeOnComplete: true, removeOnFail: false },
    );
    enqueued += 1;
  }

  console.log('re_enqueued_jobs:', enqueued);

  await queue.close();
  await connection.disconnect();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
