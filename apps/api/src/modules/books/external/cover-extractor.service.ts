import axios from "axios";
import { createWriteStream, promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { createGunzip } from "zlib";
import AdmZip from "adm-zip";
import { StorageService } from "../../../shared/services/storage.service";

/**
 * Extract cover image from an EPUB file
 * EPUB files are ZIP archives containing the book content
 * Covers are typically found in:
 * - META-INF/container.xml points to content.opf
 * - content.opf contains manifest with cover reference
 * - Or simply look for image files with 'cover' in the name
 */
export async function extractCoverFromEpub(
  epubUrl: string,
): Promise<Buffer | null> {
  const tempDir = await fs.mkdtemp(join(tmpdir(), "epub-cover-"));
  const tempFile = join(tempDir, "book.epub");

  try {
    // Download EPUB file
    console.log(`[CoverExtractor] Downloading EPUB from ${epubUrl}`);
    const response = await axios.get(epubUrl, {
      responseType: "stream",
      timeout: 30000,
    });

    // Save to temp file
    const writer = createWriteStream(tempFile);
    await new Promise<void>((resolve, reject) => {
      (response.data as Readable).pipe(writer);
      writer.on("finish", () => resolve());
      writer.on("error", reject);
    });

    // Try to extract cover using different methods
    let coverBuffer: Buffer | null = null;

    // Method 1: Try to read content.opf and find cover in manifest
    coverBuffer = await extractCoverFromOpf(tempFile);
    if (coverBuffer) {
      console.log("[CoverExtractor] ✓ Found cover via OPF manifest");
      return coverBuffer;
    }

    // Method 2: Look for files with 'cover' in the name
    coverBuffer = await extractCoverByFilename(tempFile);
    if (coverBuffer) {
      console.log("[CoverExtractor] ✓ Found cover by filename");
      return coverBuffer;
    }

    console.log("[CoverExtractor] ✗ No cover found in EPUB");
    return null;
  } catch (error) {
    console.error("[CoverExtractor] Error extracting cover:", error);
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
    const zip = new AdmZip(epubPath);

    // Read META-INF/container.xml to find content.opf path
    const containerEntry = zip.getEntry("META-INF/container.xml");
    if (!containerEntry) return null;

    const containerXml = containerEntry.getData().toString("utf-8");

    // Extract content.opf path from container.xml
    const opfPathMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
    if (!opfPathMatch) return null;

    const opfPath = opfPathMatch[1];
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) return null;

    const opfContent = opfEntry.getData().toString("utf-8");

    // Look for cover reference in OPF
    // Pattern 1: meta name="cover" content="cover-id"
    const coverMetaMatch = opfContent.match(
      /meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i,
    );
    if (coverMetaMatch) {
      const coverId = coverMetaMatch[1];
      // Find item with that ID in manifest
      const itemMatch = opfContent.match(
        new RegExp(
          `item[^>]*id=["']${coverId}["'][^>]*href=["']([^"']+)["']`,
          "i",
        ),
      );
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
    const coverItemMatch = opfContent.match(
      /item[^>]*id=["'][^"']*cover[^"']*["'][^>]*href=["']([^"']+)["']/i,
    );
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

async function extractCoverByFilename(
  epubPath: string,
): Promise<Buffer | null> {
  try {
    const zip = new AdmZip(epubPath);

    // Get all entries
    const entries = zip.getEntries();

    // Look for files with 'cover' in the name
    const coverKeywords = ["cover", "front", "title", "thumbnail"];

    for (const keyword of coverKeywords) {
      const coverEntry = entries.find((entry) => {
        const name = entry.entryName.toLowerCase();
        return (
          name.includes(keyword) &&
          (name.endsWith(".jpg") ||
            name.endsWith(".jpeg") ||
            name.endsWith(".png"))
        );
      });

      if (coverEntry) {
        return coverEntry.getData();
      }
    }

    // Fallback: Get the first image file in the OEBPS/OPS folder
    const imageEntry = entries.find((entry) => {
      const name = entry.entryName.toLowerCase();
      return (
        (name.includes("/oebps/") || name.includes("/ops/")) &&
        (name.endsWith(".jpg") ||
          name.endsWith(".jpeg") ||
          name.endsWith(".png"))
      );
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
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);

  // Resolve relative path
  if (href.startsWith("/")) {
    return href.substring(1);
  }

  if (href.startsWith("../")) {
    // Handle relative parent paths
    const parts = opfDir.split("/").filter(Boolean);
    const hrefParts = href.split("/");

    for (const part of hrefParts) {
      if (part === "..") {
        parts.pop();
      } else if (part !== ".") {
        parts.push(part);
      }
    }

    return parts.join("/");
  }

  return opfDir + href;
}

export type EpubMetadata = {
  coverBuffer: Buffer | null;
  author: string | null;
  description: string | null;
  publishedYear: number | null;
  publisher: string | null;
};

const readOpfContentFromZip = async (
  epubPathOrBuffer: string | Buffer,
): Promise<string | null> => {
  try {
    const zip = new AdmZip(epubPathOrBuffer);

    const containerEntry = zip.getEntry("META-INF/container.xml");
    if (!containerEntry) return null;

    const containerXml = containerEntry.getData().toString("utf-8");
    const opfPathMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
    if (!opfPathMatch) return null;

    const opfEntry = zip.getEntry(opfPathMatch[1]);
    if (!opfEntry) return null;

    return opfEntry.getData().toString("utf-8");
  } catch {
    return null;
  }
};

const stripXmlText = (value: string): string =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseMetadataFromOpfContent = (
  opfContent: string,
): {
  author: string | null;
  description: string | null;
  publishedYear: number | null;
  publisher: string | null;
} => {
  const authorMatch = opfContent.match(
    /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i,
  );
  const descriptionMatch = opfContent.match(
    /<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i,
  );
  const publisherMatch = opfContent.match(
    /<dc:publisher[^>]*>([\s\S]*?)<\/dc:publisher>/i,
  );
  const dateMatch = opfContent.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i);

  let publishedYear: number | null = null;
  if (dateMatch?.[1]) {
    const yearCandidate = Number.parseInt(
      (dateMatch[1].match(/\d{4}/) || [])[0] || "",
      10,
    );
    if (
      Number.isFinite(yearCandidate) &&
      yearCandidate >= 1400 &&
      yearCandidate <= new Date().getFullYear() + 1
    ) {
      publishedYear = yearCandidate;
    }
  }

  const author = authorMatch?.[1] ? stripXmlText(authorMatch[1]) : null;
  const description = descriptionMatch?.[1]
    ? stripXmlText(descriptionMatch[1])
    : null;
  const publisher = publisherMatch?.[1]
    ? stripXmlText(publisherMatch[1])
    : null;

  return {
    author: author || null,
    description: description || null,
    publishedYear,
    publisher: publisher || null,
  };
};

const extractDescriptionFromSpineDocuments = (
  zip: AdmZip,
  opfPath: string,
  opfContent: string,
): string | null => {
  const manifest = new Map<string, string>();
  const itemRegex =
    /<item\b[^>]*id=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(opfContent)) !== null) {
    manifest.set(itemMatch[1], itemMatch[2]);
  }

  const spineSection = opfContent.match(/<spine[\s\S]*?<\/spine>/i)?.[0] || "";
  const idRefs: string[] = [];
  const idRefRegex = /<itemref\b[^>]*idref=["']([^"']+)["'][^>]*>/gi;
  let idRefMatch: RegExpExecArray | null;
  while ((idRefMatch = idRefRegex.exec(spineSection)) !== null) {
    idRefs.push(idRefMatch[1]);
    if (idRefs.length >= 10) break;
  }

  for (const idRef of idRefs) {
    const href = manifest.get(idRef);
    if (!href) continue;
    const entryPath = resolvePath(opfPath, href);
    const entry = zip.getEntry(entryPath);
    if (!entry) continue;

    const raw = entry.getData().toString("utf-8");
    const cleaned = stripXmlText(raw).replace(/\s+/g, " ").trim();

    if (cleaned.length >= 220) {
      return cleaned.slice(0, 1400);
    }
  }

  return null;
};

export async function extractEpubMetadataFromFile(
  epubPath: string,
): Promise<EpubMetadata> {
  try {
    const fileBuffer = await fs.readFile(epubPath);
    return extractEpubMetadataFromBuffer(fileBuffer);
  } catch {
    return {
      coverBuffer: null,
      author: null,
      description: null,
      publishedYear: null,
      publisher: null,
    };
  }
}

export async function extractEpubMetadataFromBuffer(
  epubBuffer: Buffer,
): Promise<EpubMetadata> {
  try {
    const zip = new AdmZip(epubBuffer);
    const entries = zip.getEntries();

    let coverBuffer: Buffer | null = null;
    const opfContent = await readOpfContentFromZip(epubBuffer);

    if (opfContent) {
      const containerEntry = zip.getEntry("META-INF/container.xml");
      if (containerEntry) {
        const containerXml = containerEntry.getData().toString("utf-8");
        const opfPathMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
        if (opfPathMatch) {
          const opfPath = opfPathMatch[1];
          const coverMetaMatch = opfContent.match(
            /meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i,
          );
          if (coverMetaMatch) {
            const coverId = coverMetaMatch[1];
            const itemMatch = opfContent.match(
              new RegExp(
                `item[^>]*id=["']${coverId}["'][^>]*href=["']([^"']+)["']`,
                "i",
              ),
            );
            if (itemMatch?.[1]) {
              const coverPath = resolvePath(opfPath, itemMatch[1]);
              const coverEntry = zip.getEntry(coverPath);
              if (coverEntry) coverBuffer = coverEntry.getData();
            }
          }

          if (!coverBuffer) {
            const coverItemMatch = opfContent.match(
              /item[^>]*id=["'][^"']*cover[^"']*["'][^>]*href=["']([^"']+)["']/i,
            );
            if (coverItemMatch?.[1]) {
              const coverPath = resolvePath(opfPath, coverItemMatch[1]);
              const coverEntry = zip.getEntry(coverPath);
              if (coverEntry) coverBuffer = coverEntry.getData();
            }
          }
        }
      }
    }

    if (!coverBuffer) {
      const coverKeywords = ["cover", "front", "title", "thumbnail"];
      for (const keyword of coverKeywords) {
        const coverEntry = entries.find((entry) => {
          const name = entry.entryName.toLowerCase();
          return (
            name.includes(keyword) &&
            (name.endsWith(".jpg") ||
              name.endsWith(".jpeg") ||
              name.endsWith(".png"))
          );
        });
        if (coverEntry) {
          coverBuffer = coverEntry.getData();
          break;
        }
      }
    }

    const parsed = opfContent
      ? parseMetadataFromOpfContent(opfContent)
      : {
          author: null,
          description: null,
          publishedYear: null,
          publisher: null,
        };

    const derivedDescription =
      parsed.description && parsed.description.length >= 120
        ? parsed.description
        : opfContent &&
          (() => {
            const containerEntry = zip.getEntry("META-INF/container.xml");
            if (!containerEntry) return null;
            const containerXml = containerEntry.getData().toString("utf-8");
            const opfPathMatch = containerXml.match(
              /full-path=["']([^"']+)["']/i,
            );
            if (!opfPathMatch) return null;
            return extractDescriptionFromSpineDocuments(
              zip,
              opfPathMatch[1],
              opfContent,
            );
          })();

    return {
      coverBuffer,
      author: parsed.author,
      description: derivedDescription || parsed.description,
      publishedYear: parsed.publishedYear,
      publisher: parsed.publisher,
    };
  } catch {
    return {
      coverBuffer: null,
      author: null,
      description: null,
      publishedYear: null,
      publisher: null,
    };
  }
}

/**
 * Extract both cover image and author (<dc:creator>) from an EPUB in a single download.
 */
export async function extractEpubMetadata(
  epubUrl: string,
): Promise<EpubMetadata> {
  const tempDir = await fs.mkdtemp(join(tmpdir(), "epub-meta-"));
  const tempFile = join(tempDir, "book.epub");

  try {
    console.log(
      `[CoverExtractor] Downloading EPUB for metadata from ${epubUrl}`,
    );
    const response = await axios.get(epubUrl, {
      responseType: "stream",
      timeout: 30000,
    });

    const writer = createWriteStream(tempFile);
    await new Promise<void>((resolve, reject) => {
      (response.data as Readable).pipe(writer);
      writer.on("finish", () => resolve());
      writer.on("error", reject);
    });

    const { coverBuffer, author, description, publishedYear, publisher } =
      await extractEpubMetadataFromFile(tempFile);

    if (coverBuffer) {
      console.log("[CoverExtractor] ✓ Found cover via metadata extraction");
    }
    if (author) {
      console.log(`[CoverExtractor] ✓ Found author: ${author}`);
    }
    if (publishedYear) {
      console.log(`[CoverExtractor] ✓ Found year: ${publishedYear}`);
    }

    return { coverBuffer, author, description, publishedYear, publisher };
  } catch (error) {
    console.error("[CoverExtractor] Error extracting EPUB metadata:", error);
    return {
      coverBuffer: null,
      author: null,
      description: null,
      publishedYear: null,
      publisher: null,
    };
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

/**
 * Upload cover to storage and return URL
 */
export async function uploadCoverImage(
  storageService: StorageService,
  bookId: string,
  imageBuffer: Buffer,
): Promise<string> {
  const key = `book-covers/${bookId}/cover.jpg`;
  await storageService.uploadBuffer(key, imageBuffer, "image/jpeg");
  return storageService.getPublicUrl(key);
}
