const { PrismaClient } = require('@prisma/client');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const prisma = new PrismaClient();

const s3Client = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const bucket = process.env.S3_BUCKET;
const storagePublicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || '';

async function main() {
  console.log('Listing R2 covers under covers/books/...');
  
  const coverKeyBySlug = new Map();
  let continuationToken;
  
  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'covers/books/',
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));
    
    for (const obj of response.Contents || []) {
      const key = obj.Key;
      if (!key || !key.endsWith('.jpg') && !key.endsWith('.jpeg') && !key.endsWith('.png')) continue;
      
      const parts = key.split('/');
      const filename = parts[parts.length - 1];
      const slug = filename.replace(/\.(jpg|jpeg|png)$/i, '');
      coverKeyBySlug.set(slug, key);
    }
    
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  
  console.log(`Found ${coverKeyBySlug.size} covers in R2`);
  
  // Check for Elsci books with null coverUrl
  const elsciBooks = await prisma.book.findMany({
    where: {
      status: 'active',
      OR: [{ coverUrl: null }, { coverUrl: '' }],
      slug: { startsWith: 'elsci-ln-' },
    },
    select: { id: true, slug: true, coverUrl: true },
    take: 200,
  });
  
  console.log(`Found ${elsciBooks.length} Elsci books with null coverUrl`);
  
  let matched = 0;
  let updated = 0;
  
  for (const book of elsciBooks) {
    const key = coverKeyBySlug.get(book.slug);
    if (key) {
      matched++;
      const coverUrl = storagePublicBaseUrl
        ? `${storagePublicBaseUrl.replace(/\/+$/, '')}/${key}`
        : `/api/v1/books/download?key=${encodeURIComponent(key)}`;
      
      await prisma.book.update({
        where: { id: book.id },
        data: { coverUrl },
      });
      updated++;
      console.log(`Updated ${book.slug} -> ${coverUrl}`);
    } else {
      console.log(`No cover found for ${book.slug}`);
    }
  }
  
  console.log(`\nSummary: ${matched} matched, ${updated} updated`);
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
