const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const completed = await p.movie.findMany({
    where: {
      status: 'active',
      NOT: { fileUrls: { equals: {} } }
    },
    select: { 
      title: true, 
      fileUrls: true, 
      updatedAt: true,
      metadata: true 
    },
    orderBy: { updatedAt: 'desc' },
    take: 20
  });
  
  console.log(`Movies with fileUrls: ${completed.length}\n`);
  
  completed.forEach(m => {
    const urls = Object.entries(m.fileUrls).map(([k, v]) => `${k}: ${v?.substring(0, 60)}...`).join('\n    ');
    const meta = m.metadata || {};
    console.log(`${m.title}:`);
    console.log(`  Updated: ${m.updatedAt}`);
    console.log(`  Source: ${meta.source || 'unknown'}`);
    console.log(`  Files:\n    ${urls}`);
    console.log();
  });
  
  await p.$disconnect();
}

main();
