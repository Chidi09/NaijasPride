const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== BOOK JOBS ===');
  const bookFailed = await prisma.job.count({ where: { type: 'book-import', status: 'failed' } });
  const coverFailed = await prisma.job.count({ where: { type: 'book-cover-processing', status: 'failed' } });
  const bookPending = await prisma.job.count({ where: { type: 'book-import', status: 'pending' } });
  const coverPending = await prisma.job.count({ where: { type: 'book-cover-processing', status: 'pending' } });
  
  console.log('Failed book-import jobs:', bookFailed);
  console.log('Failed book-cover jobs:', coverFailed);
  console.log('Pending book-import jobs:', bookPending);
  console.log('Pending book-cover jobs:', coverPending);
  
  console.log('\n=== MOVIES ===');
  const total = await prisma.movie.count();
  const active = await prisma.movie.count({ where: { status: 'active' } });
  const processing = await prisma.movie.count({ where: { status: 'processing' } });
  const pending = await prisma.movie.count({ where: { status: 'pending' } });
  
  console.log('Total movies in DB:', total);
  console.log('  Active:', active);
  console.log('  Processing:', processing);
  console.log('  Pending:', pending);
  
  const recent = await prisma.movie.findMany({
    where: {},
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { title: true, year: true, status: true, fileUrls: true, createdAt: true }
  });
  
  console.log('\nLast 10 movies created:');
  recent.forEach(m => {
    const hasFiles = m.fileUrls && Object.keys(m.fileUrls).length > 0;
    console.log(` - ${m.title} (${m.year}) [${m.status}] files=${hasFiles ? 'yes' : 'no'} ${m.createdAt.toISOString()}`);
  });
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
