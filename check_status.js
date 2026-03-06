const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const processing = await p.movie.count({ where: { status: 'processing' } });
  const pending = await p.movie.count({ where: { status: 'pending' } });
  const active = await p.movie.count({ where: { status: 'active' } });
  const withFiles = await p.movie.findMany({
    where: { NOT: { fileUrls: { equals: {} } } },
    select: { title: true, fileUrls: true },
    take: 10
  });
  console.log('processing:', processing);
  console.log('pending:', pending);
  console.log('active:', active);
  console.log('with fileUrls (sample):', JSON.stringify(withFiles, null, 2));
  await p.$disconnect();
}
main().catch(console.error);
