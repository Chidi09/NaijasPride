const { PrismaClient } = require('/app/node_modules/@prisma/client');
const p = new PrismaClient();

async function run() {
  const movies = await p.movie.findMany({
    where: {
      status: 'active',
      thumbnailUrl: null,
      posterUrl: null,
      NOT: [{ youtubeId: null }, { youtubeId: '' }]
    },
    select: { id: true, youtubeId: true },
  });

  console.log('Movies to backfill:', movies.length);

  let updated = 0;
  for (const m of movies) {
    const thumbnailUrl = 'https://i.ytimg.com/vi/' + m.youtubeId + '/hqdefault.jpg';
    await p.movie.update({ where: { id: m.id }, data: { thumbnailUrl } });
    updated++;
    if (updated % 200 === 0) console.log('Updated', updated, '/', movies.length);
  }

  console.log('Done. Total updated:', updated);
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
