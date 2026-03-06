const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const processing = await p.movie.count({ where: { status: 'processing' } });
  const pending = await p.movie.count({ where: { status: 'pending' } });
  const activeWithFiles = await p.movie.findMany({
    where: {
      AND: [
        { status: 'active' },
        { NOT: { fileUrls: { equals: {} } } }
      ]
    },
    select: { title: true, fileUrls: true },
    take: 10
  });
  
  console.log('=== Torrent Pipeline Status ===');
  console.log('Processing:', processing);
  console.log('Pending:', pending);
  console.log('\nActive movies with fileUrls:');
  activeWithFiles.forEach(m => {
    const urls = Object.entries(m.fileUrls).map(([k, v]) => `${k}: ${v}`).join(', ');
    console.log(`  - ${m.title}: ${urls}`);
  });
  
  await p.$disconnect();
}

main().catch(console.error);
