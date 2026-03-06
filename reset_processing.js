const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  // Reset all stuck processing movies back to pending
  const result = await p.movie.updateMany({
    where: { status: 'processing' },
    data: { status: 'pending' }
  });
  console.log('Reset to pending:', result.count);

  // Check real R2 movies (media.naijaspride.com URLs, not test entries)
  const realR2 = await p.movie.findMany({
    where: {
      AND: [
        { NOT: { fileUrls: { equals: {} } } },
        { status: 'active' }
      ]
    },
    select: { title: true, fileUrls: true }
  });
  console.log('Active movies with fileUrls:', realR2.length);
  realR2.forEach(m => console.log(' -', m.title));

  await p.$disconnect();
}
main().catch(console.error);
