const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const pending = await p.movie.findMany({
    where: { status: 'pending' },
    select: { id: true, title: true, metadata: true, youtubeId: true, isStreamOnly: true },
    take: 10
  });
  
  console.log('Sample pending movies:');
  pending.forEach(m => {
    console.log(`\n${m.title}:`);
    console.log(`  youtubeId: ${m.youtubeId}`);
    console.log(`  isStreamOnly: ${m.isStreamOnly}`);
    console.log(`  metadata: ${JSON.stringify(m.metadata)}`);
  });
  
  // Count by type
  const withYoutube = await p.movie.count({ 
    where: { status: 'pending', youtubeId: { not: null } } 
  });
  const streamOnly = await p.movie.count({ 
    where: { status: 'pending', isStreamOnly: true } 
  });
  const withMetadata = await p.movie.count({ 
    where: { status: 'pending', metadata: { not: null } } 
  });
  
  console.log(`\nPending breakdown:`);
  console.log(`  With youtubeId: ${withYoutube}`);
  console.log(`  Stream only: ${streamOnly}`);
  console.log(`  With metadata: ${withMetadata}`);
  
  await p.$disconnect();
}

main().catch(console.error);
