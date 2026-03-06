const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const total = await p.movie.count();
  const pending = await p.movie.count({ where: { status: 'pending' } });
  const processing = await p.movie.count({ where: { status: 'processing' } });
  const active = await p.movie.count({ where: { status: 'active' } });
  const withFiles = await p.movie.count({ where: { NOT: { fileUrls: { equals: {} } } } });
  
  console.log('Total movies:', total);
  console.log('Pending:', pending);
  console.log('Processing:', processing);
  console.log('Active:', active);
  console.log('With fileUrls:', withFiles);
  
  await p.$disconnect();
}

main();
