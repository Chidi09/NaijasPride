const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const ytsPending = await p.movie.count({ 
    where: { 
      status: 'pending',
      OR: [
        { source: { contains: 'yts', mode: 'insensitive' } },
        { source: { contains: 'YTS', mode: 'insensitive' } }
      ]
    } 
  });
  const totalPending = await p.movie.count({ where: { status: 'pending' } });
  console.log('YTS pending:', ytsPending);
  console.log('Total pending:', totalPending);
  await p.$disconnect();
}

main();
