/**
 * book-series-sort.ts
 *
 * Sorts a list of books so that:
 *   1. Volumes from the same series stay together (series grouping)
 *   2. Within a series, volumes are ordered numerically ascending (vol 1 → 2 → …)
 *   3. Series that are "nearest to complete" — i.e. have the fewest missing
 *      volumes relative to how many are already present — are processed first
 *   4. Single-volume books (no volume number detected) come last
 *
 * This ensures that once we start a series we finish it in order before
 * jumping to the next one, and we prioritise nearly-complete series over
 * ones that only have a few volumes so far.
 */

type BookLike = {
  id: string;
  title: string;
  [key: string]: unknown;
};

// Patterns that extract (seriesName, volumeNumber) from a title.
// Tried in order; first match wins.
const VOLUME_PATTERNS: Array<RegExp> = [
  /^(.+?)\s*[-–]\s*volume\s+(\d+(?:\.\d+)?)/i,   // "Title - Volume 03"
  /^(.+?)\s*[-–]\s*vol\.?\s*(\d+(?:\.\d+)?)/i,   // "Title - Vol. 3"
  /^(.+?)\s+volume\s+(\d+(?:\.\d+)?)\b/i,         // "Title Volume 3"
  /^(.+?)\s+vol\.?\s+(\d+(?:\.\d+)?)\b/i,         // "Title Vol 3"
  /^(.+?)\s+v(\d+(?:\.\d+)?)\s*$/i,               // "Title v3"
  /^(.+?)\s+#(\d+(?:\.\d+)?)\b/i,                 // "Title #3"
];

export type ParsedBook<T extends BookLike> = {
  book: T;
  seriesKey: string | null;  // normalised series name, null = standalone
  volume: number;            // 0 = unknown / standalone
};

/**
 * Parse a book title into (seriesKey, volume).
 */
export function parseSeriesInfo<T extends BookLike>(book: T): ParsedBook<T> {
  for (const pattern of VOLUME_PATTERNS) {
    const m = book.title.match(pattern);
    if (m) {
      const seriesKey = m[1].trim().toLowerCase().replace(/\s+/g, ' ');
      const volume = parseFloat(m[2]);
      return { book, seriesKey, volume: Number.isFinite(volume) ? volume : 0 };
    }
  }
  return { book, seriesKey: null, volume: 0 };
}

/**
 * Given the full DB state for a series (all volumes, mirrored + unmirrored),
 * return the lowest unmirrored volume that should be processed next.
 * If volume N is not yet mirrored, volumes N+1, N+2 … are deferred.
 *
 * @param allVolumes  - All known volumes (mirrored + not) sorted ascending.
 * @param isMirrored  - Predicate: returns true if this book is already on R2.
 */
export function nextVolumeToMirror<T extends BookLike>(
  allVolumes: ParsedBook<T>[],
  isMirrored: (b: T) => boolean,
): ParsedBook<T> | null {
  const sorted = [...allVolumes].sort((a, b) => a.volume - b.volume);
  for (const entry of sorted) {
    if (!isMirrored(entry.book)) return entry; // first gap
  }
  return null; // all mirrored
}

/**
 * Sort an array of books series-first, volume-ordered, nearest-complete first.
 *
 * @param books  - The pool of books to sort (all unmirrored candidates).
 * @returns      - Sorted copy of the array.
 */
export function sortBooksBySeriesAndVolume<T extends BookLike>(books: T[]): T[] {
  if (books.length === 0) return [];

  const parsed = books.map(parseSeriesInfo);

  // Group by seriesKey
  const seriesMap = new Map<string, ParsedBook<T>[]>();
  const standalones: ParsedBook<T>[] = [];

  for (const p of parsed) {
    if (p.seriesKey === null) {
      standalones.push(p);
    } else {
      const group = seriesMap.get(p.seriesKey) ?? [];
      group.push(p);
      seriesMap.set(p.seriesKey, group);
    }
  }

  // Score each series: lower = process sooner.
  // Priority = missingVolumeRange / presentCount
  //   - A series with vols 1,2,3 missing only nothing scores 0 (best)
  //   - A series with vols 1,5 has a range of 5 but only 2 present → high ratio (worse)
  // Tie-break by series name alphabetically for determinism.
  type SeriesEntry = { key: string; items: ParsedBook<T>[]; priority: number };
  const seriesEntries: SeriesEntry[] = [];

  for (const [key, items] of seriesMap) {
    items.sort((a, b) => a.volume - b.volume);
    const vols = items.map((i) => i.volume).filter((v) => v > 0);
    let priority = 0;
    if (vols.length >= 2) {
      const min = Math.min(...vols);
      const max = Math.max(...vols);
      const range = max - min + 1;
      const missing = range - vols.length; // gaps within the range we have
      // Lower missing-ratio = better (more complete)
      priority = missing / vols.length;
    }
    seriesEntries.push({ key, items, priority });
  }

  // Sort series: lowest priority score first (most complete), then alphabetical
  seriesEntries.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.key.localeCompare(b.key);
  });

  // Flatten: series in priority order, each series volumes ascending, then standalones
  const result: T[] = [];
  for (const entry of seriesEntries) {
    for (const p of entry.items) {
      result.push(p.book);
    }
  }
  for (const p of standalones) {
    result.push(p.book);
  }

  return result;
}
