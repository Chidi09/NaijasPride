import axios from 'axios';
import { createWriteStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { createGunzip } from 'zlib';

/**
 * Extract cover image from an EPUB file
 * EPUB files are ZIP archives containing the book content
 * Covers are typically found in:
 * - META-INF/container.xml points to content.opf
 * - content.opf contains manifest with cover reference
 * - Or simply look for image files with 'cover' in the name
 */
export async function extractCoverFromEpub(epubUrl: string): Promise<Buffer | null> {
  const tempDir = await fs.mkdtemp(join(tmpdir(), 'epub-cover-'));
  const tempFile = join(tempDir, 'book.epub');

  try {
    // Download EPUB file
    console.log(`[CoverExtractor] Downloading EPUB from ${epubUrl}`);
    const response = await axios.get(epubUrl, {
      responseType: 'stream',
      timeout: 30000,
    });

    // Save to temp file
    const writer = createWriteStream(tempFile);
    await new Promise<void>((resolve, reject) => {
      (response.data as Readable).pipe(writer);
      writer.on('finish', () => resolve());
      writer.on('error', reject);
    });

    // Try to extract cover using different methods
    let coverBuffer: Buffer | null = null;

    // Method 1: Try to read content.opf and find cover in manifest
    coverBuffer = await extractCoverFromOpf(tempFile);
    if (coverBuffer) {
      console.log('[CoverExtractor] ✓ Found cover via OPF manifest');
      return coverBuffer;
    }

    // Method 2: Look for files with 'cover' in the name
    coverBuffer = await extractCoverByFilename(tempFile);
    if (coverBuffer) {
      console.log('[CoverExtractor] ✓ Found cover by filename');
      return coverBuffer;
    }

    console.log('[CoverExtractor] ✗ No cover found in EPUB');
    return null;

  } catch (error) {
    console.error('[CoverExtractor] Error extracting cover:', error);
    return null;
  } finally {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function extractCoverFromOpf(epubPath: string): Promise<Buffer | null> {
  try {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(epubPath);

    // Read META-INF/container.xml to find content.opf path
    const containerEntry = zip.getEntry('META-INF/container.xml');
    if (!containerEntry) return null;

    const containerXml = containerEntry.getData().toString('utf-8');

    // Extract content.opf path from container.xml
    const opfPathMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
    if (!opfPathMatch) return null;

    const opfPath = opfPathMatch[1];
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) return null;

    const opfContent = opfEntry.getData().toString('utf-8');

    // Look for cover reference in OPF
    // Pattern 1: meta name="cover" content="cover-id"
    const coverMetaMatch = opfContent.match(/meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i);
    if (coverMetaMatch) {
      const coverId = coverMetaMatch[1];
      // Find item with that ID in manifest
      const itemMatch = opfContent.match(new RegExp(`item[^>]*id=["']${coverId}["'][^>]*href=["']([^"']+)["']`, 'i'));
      if (itemMatch) {
        const coverHref = itemMatch[1];
        const coverPath = resolvePath(opfPath, coverHref);
        const coverEntry = zip.getEntry(coverPath);
        if (coverEntry) {
          return coverEntry.getData();
        }
      }
    }

    // Pattern 2: Look for item with id containing 'cover'
    const coverItemMatch = opfContent.match(/item[^>]*id=["'][^"']*cover[^"']*["'][^>]*href=["']([^"']+)["']/i);
    if (coverItemMatch) {
      const coverHref = coverItemMatch[1];
      const coverPath = resolvePath(opfPath, coverHref);
      const coverEntry = zip.getEntry(coverPath);
      if (coverEntry) {
        return coverEntry.getData();
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function extractCoverByFilename(epubPath: string): Promise<Buffer | null> {
  try {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(epubPath);

    // Get all entries
    const entries = zip.getEntries();

    // Look for files with 'cover' in the name
    const coverKeywords = ['cover', 'front', 'title', 'thumbnail'];

    for (const keyword of coverKeywords) {
      const coverEntry = entries.find(entry => {
        const name = entry.entryName.toLowerCase();
        return name.includes(keyword) &&
               (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png'));
      });

      if (coverEntry) {
        return coverEntry.getData();
      }
    }

    // Fallback: Get the first image file in the OEBPS/OPS folder
    const imageEntry = entries.find(entry => {
      const name = entry.entryName.toLowerCase();
      return (name.includes('/oebps/') || name.includes('/ops/')) &&
             (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png'));
    });

    if (imageEntry) {
      return imageEntry.getData();
    }

    return null;
  } catch {
    return null;
  }
}

function resolvePath(opfPath: string, href: string): string {
  // Get the directory of the OPF file
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

  // Resolve relative path
  if (href.startsWith('/')) {
    return href.substring(1);
  }

  if (href.startsWith('../')) {
    // Handle relative parent paths
    const parts = opfDir.split('/').filter(Boolean);
    const hrefParts = href.split('/');

    for (const part of hrefParts) {
      if (part === '..') {
        parts.pop();
      } else if (part !== '.') {
        parts.push(part);
      }
    }

    return parts.join('/');
  }

  return opfDir + href;
}

export type EpubMetadata = {
  coverBuffer: Buffer | null;
  author: string | null;
};

export async function extractEpubMetadataFromFile(epubPath: string): Promise<EpubMetadata> {
  try {
    const [coverBuffer, author] = await Promise.all([
      extractCoverFromOpf(epubPath)
        .then(async (buf) => buf ?? extractCoverByFilename(epubPath)),
      extractAuthorFromOpf(epubPath),
    ]);

    return { coverBuffer, author };
  } catch {
    return { coverBuffer: null, author: null };
  }
}

/**
 * Extract both cover image and author (<dc:creator>) from an EPUB in a single download.
 */
export async function extractEpubMetadata(epubUrl: string): Promise<EpubMetadata> {
  const tempDir = await fs.mkdtemp(join(tmpdir(), 'epub-meta-'));
  const tempFile = join(tempDir, 'book.epub');

  try {
    console.log(`[CoverExtractor] Downloading EPUB for metadata from ${epubUrl}`);
    const response = await axios.get(epubUrl, {
      responseType: 'stream',
      timeout: 30000,
    });

    const writer = createWriteStream(tempFile);
    await new Promise<void>((resolve, reject) => {
      (response.data as Readable).pipe(writer);
      writer.on('finish', () => resolve());
      writer.on('error', reject);
    });

    const { coverBuffer, author } = await extractEpubMetadataFromFile(tempFile);

    if (coverBuffer) {
      console.log('[CoverExtractor] ✓ Found cover via metadata extraction');
    }
    if (author) {
      console.log(`[CoverExtractor] ✓ Found author: ${author}`);
    }

    return { coverBuffer, author };
  } catch (error) {
    console.error('[CoverExtractor] Error extracting EPUB metadata:', error);
    return { coverBuffer: null, author: null };
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

async function extractAuthorFromOpf(epubPath: string): Promise<string | null> {
  try {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(epubPath);

    const containerEntry = zip.getEntry('META-INF/container.xml');
    if (!containerEntry) return null;

    const containerXml = containerEntry.getData().toString('utf-8');
    const opfPathMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
    if (!opfPathMatch) return null;

    const opfEntry = zip.getEntry(opfPathMatch[1]);
    if (!opfEntry) return null;

    const opfContent = opfEntry.getData().toString('utf-8');

    // Match <dc:creator ...>Author Name</dc:creator>
    const creatorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    if (creatorMatch) {
      const author = creatorMatch[1].trim();
      if (author) return author;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Upload cover to storage and return URL
 */
export async function uploadCoverImage(
  storageService: any,
  bookId: string,
  imageBuffer: Buffer,
): Promise<string> {
  const key = `book-covers/${bookId}/cover.jpg`;
  await storageService.uploadBuffer(key, imageBuffer, 'image/jpeg');
  return storageService.getPublicUrl(key);
}
