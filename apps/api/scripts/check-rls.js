require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const tables = [
  'Download',
  '_UserWatchlist',
  '_prisma_migrations',
  'User',
  'WatchHistory',
  'MovieNotification',
  'BookProgress',
  'RssFeed',
  'Book',
  'Plan',
  'MangaFavorite',
  'Movie',
  'Cast',
  'YouTubeChannel',
  'MangaReadingProgress',
];

async function main() {
  const sql = `
    SELECT relname, relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND relname = ANY($1::text[])
    ORDER BY relname
  `;

  const rows = await prisma.$queryRawUnsafe(sql, tables);
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
