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
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`);
    console.log(`RLS enabled: ${table}`);
  }

  // Supabase-only roles. If this project is not running on Supabase, these may not exist.
  const restrictedTables = ['User', 'Book', 'Movie', 'Plan', '_prisma_migrations'];
  for (const table of restrictedTables) {
    for (const role of ['anon', 'authenticated']) {
      try {
        await prisma.$executeRawUnsafe(`REVOKE ALL ON TABLE public."${table}" FROM ${role}`);
        console.log(`Revoked table privileges on ${table} from ${role}`);
      } catch (error) {
        console.log(`Skipped revoke on ${table} for ${role} (${error.message || 'role missing'})`);
      }
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
