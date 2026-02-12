require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function decodeEntities(input) {
  return input
    .replace(/&#0*39;?/gi, "'")
    .replace(/&apos;?/gi, "'")
    .replace(/&quot;?/gi, '"')
    .replace(/&amp;?/gi, ' and ')
    .replace(/&nbsp;?/gi, ' ');
}

function slugifyTitle(title, year) {
  const normalized = decodeEntities(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized) {
    return `movie-${year}`;
  }

  return `${normalized}-${year}`;
}

async function main() {
  const movies = await prisma.movie.findMany({
    select: {
      id: true,
      title: true,
      year: true,
      slug: true,
    },
  });

  const inUse = new Set(movies.map((movie) => movie.slug));
  let updated = 0;

  for (const movie of movies) {
    let candidate = slugifyTitle(movie.title, movie.year);
    if (!candidate || candidate === `movie-${movie.year}`) {
      candidate = `movie-${movie.id.slice(0, 8)}-${movie.year}`;
    }

    if (candidate === movie.slug) continue;

    inUse.delete(movie.slug);
    let finalSlug = candidate;
    let suffix = 1;
    while (inUse.has(finalSlug)) {
      finalSlug = `${candidate}-${suffix++}`;
    }

    await prisma.movie.update({
      where: { id: movie.id },
      data: { slug: finalSlug },
    });

    inUse.add(finalSlug);
    updated++;
  }

  console.log(`Movie slugs normalized: ${updated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
