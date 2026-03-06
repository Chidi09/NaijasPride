const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const p = new PrismaClient();

async function fetchInfoHash(detailUrl) {
  try {
    // Use FlareSolverr if available, otherwise direct
    const flaresolverrUrl = process.env.FLARESOLVERR_URL || 'http://flaresolverr:8191/v1';
    
    // Try FlareSolverr first
    try {
      const response = await axios.post(flaresolverrUrl, {
        cmd: 'request.get',
        url: detailUrl,
        maxTimeout: 30000
      }, { timeout: 35000 });
      
      const html = response.data?.solution?.response || response.data?.response;
      if (html) {
        // Extract info hash from magnet link
        const match = html.match(/magnet:\?xt=urn:btih:([a-fA-F0-9]{40})/i);
        if (match) return match[1].toUpperCase();
      }
    } catch (e) {
      console.log(`FlareSolverr failed for ${detailUrl}:`, e.message);
    }
    
    // Try direct fetch
    const response = await axios.get(detailUrl, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const match = response.data.match(/magnet:\?xt=urn:btih:([a-fA-F0-9]{40})/i);
    if (match) return match[1].toUpperCase();
    
    return null;
  } catch (error) {
    console.error(`Failed to fetch ${detailUrl}:`, error.message);
    return null;
  }
}

async function main() {
  const missing = await p.movie.findMany({
    where: { 
      status: 'pending',
      metadata: { not: null }
    },
    select: { id: true, title: true, metadata: true },
    take: 50
  });
  
  // Filter to those without infoHash
  const needFetching = missing.filter(m => {
    const meta = m.metadata || {};
    return !meta.sourceInfoHash && meta.sourceDetailUrl;
  });
  
  console.log(`Found ${needFetching.length} movies needing info hash fetch`);
  
  let found = 0;
  for (const movie of needFetching.slice(0, 10)) {
    const meta = movie.metadata || {};
    const detailUrl = meta.sourceDetailUrl;
    
    console.log(`Fetching: ${movie.title}...`);
    const infoHash = await fetchInfoHash(detailUrl);
    
    if (infoHash) {
      console.log(`  Found: ${infoHash}`);
      
      // Update metadata with info hash
      await p.movie.update({
        where: { id: movie.id },
        data: {
          metadata: {
            ...meta,
            sourceInfoHash: infoHash,
            infoHashFetchedAt: new Date().toISOString()
          }
        }
      });
      found++;
    } else {
      console.log(`  Not found`);
    }
    
    // Small delay between requests
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\nFound ${found} info hashes`);
  await p.$disconnect();
}

main().catch(console.error);
