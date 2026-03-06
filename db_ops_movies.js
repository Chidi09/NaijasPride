const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listSmokeTests() {
  const rows = await prisma.movie.findMany({
    where: { title: { contains: 'Smoke Test', mode: 'insensitive' } },
    select: { id: true, title: true, status: true, fileUrls: true },
  });
  console.log('SMOKE_TEST_ROWS');
  console.log(JSON.stringify(rows, null, 2));
}

async function deleteSmokeTests() {
  const result = await prisma.movie.deleteMany({
    where: { title: { contains: 'Smoke Test', mode: 'insensitive' } },
  });
  console.log('DELETED_COUNT', result.count);
}

async function listProcessing() {
  const rows = await prisma.movie.findMany({
    where: { status: 'processing' },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  console.log('PROCESSING_ROWS');
  console.log(JSON.stringify(rows, null, 2));
}

async function main() {
  const mode = process.argv[2] || 'list-processing';
  if (mode === 'list-smoke') {
    await listSmokeTests();
  } else if (mode === 'delete-smoke') {
    await deleteSmokeTests();
  } else {
    await listProcessing();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
