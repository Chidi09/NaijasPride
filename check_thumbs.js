const { PrismaClient } = require('/app/node_modules/@prisma/client');
const p = new PrismaClient();

async function run() {
  const [nullThumb, hasThumb, sample] = await Promise.all([
    p.movie.count({ where: { status: 'active', thumbnailUrl: null } }),
    p.movie.count({ where: { status: 'active', NOT: { thumbnailUrl: null } } }),
    p.movie.findMany({
      where: { status: 'active', NOT: { thumbnailUrl: null } },
      select: { title: true, thumbnailUrl: true, youtubeId: true },
      take: 5
    })
  ]);
  console.log('Active movies null thumbnailUrl:', nullThumb);
  console.log('Active movies with thumbnailUrl:', hasThumb);
  console.log('Sample:');
  sample.forEach(m => console.log(' ', m.title.slice(0, 50), '->', m.thumbnailUrl));
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
