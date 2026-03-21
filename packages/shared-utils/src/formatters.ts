/**
 * Normalizes a raw YouTube video title (typically from Nollywood channels) by
 * stripping pipe/dash-separated metadata segments, noise keywords, quality
 * labels, and bare year tokens so we're left with just the movie name.
 *
 * Examples:
 *   "Lion Heart | Genevieve Nnaji, Pete Edochie | Full Movie 2024"
 *     → "Lion Heart"
 *   "BLOOD SISTERS (2022) Netflix Full Movie HD"
 *     → "Blood Sisters"
 *   "Latest Yoruba Movie 2026 - Omo Ghetto Full Movie"
 *     → "Omo Ghetto"
 */
export function normalizeYouTubeTitle(raw: string): string {
  if (!raw) return raw;

  // ── Step 1: split on pipe (|) or em/en-dash (–—) ───────────────────────
  // Take the segment that does NOT look like pure metadata.
  const pipeSegments = raw.split(/\s*[|–—]\s*/);

  // Pick the first non-noise segment as our candidate title.
  const isNoise = (s: string) =>
    /\b(full\s+movie|full\s+film|official\s+movie|nollywood|hollywood|bollywood|yoruba|igbo|hausa|african|naija|4k|uhd|fhd|hd|1080p|720p|latest\s+movie|latest\s+film)\b/i.test(s);

  const candidate = pipeSegments.find((seg) => seg.trim().length > 0 && !isNoise(seg.trim()))
    ?? pipeSegments[0];

  let title = candidate.trim();

  // ── Step 2: strip leading noise prefixes ────────────────────────────────
  // e.g. "Latest Nollywood Movie - Omo Ghetto" after pipe split
  title = title.replace(
    /^(?:latest|new|best|top)\s+(?:nollywood|yoruba|igbo|hausa|african|naija|hollywood|bollywood)?\s*(?:full\s+)?(?:movies?|films?)?\s*[-–—]?\s*/gi,
    '',
  );

  // ── Step 3: strip noise keywords that sneak into the title segment ───────
  const noisePhrases: RegExp[] = [
    /\bfull\s+(?:hd\s+)?(?:movie|film)\b/gi,
    /\bofficial\s+(?:full\s+)?(?:movie|film)\b/gi,
    /\bnollywood\s+(?:movies?|films?)?\b/gi,
    /\bhollywood\s+(?:movies?|films?)?\b/gi,
    /\bbolly\s*wood\s+(?:movies?|films?)?\b/gi,
    /\byoruba\s+(?:movies?|films?)?\b/gi,
    /\bigbo\s+(?:movies?|films?)?\b/gi,
    /\bhausa\s+(?:movies?|films?)?\b/gi,
    /\bafrican\s+(?:movies?|films?)?\b/gi,
    /\bnaija\s+(?:movies?|films?)?\b/gi,
    /\b(?:4k|uhd|fhd|full\s+hd|1080p|720p|480p|hd)\b/gi,
  ];

  for (const re of noisePhrases) {
    title = title.replace(re, '');
  }

  // ── Step 4: remove year tokens ────────────────────────────────────────────
  // "(2024)", "[2024]", plain "2024"
  title = title.replace(/[\[(]\s*(?:19|20)\d{2}\s*[\])]/g, '');
  title = title.replace(/\b(?:19|20)\d{2}\b/g, '');

  // ── Step 5: collapse whitespace and clean punctuation ─────────────────────
  title = title.replace(/\s{2,}/g, ' ').trim();
  title = title.replace(/^[-–—:,.\s]+|[-–—:,.\s]+$/g, '').trim();

  // ── Step 6: title-case ALL-CAPS titles (>50 % uppercase letters) ──────────
  const letters = title.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 3) {
    const upperRatio = (letters.match(/[A-Z]/g) || []).length / letters.length;
    if (upperRatio > 0.6) {
      title = title
        .toLowerCase()
        .replace(/(?:^|\s|[-–—(])\S/g, (ch) => ch.toUpperCase());
    }
  }

  return title || raw.trim();
}

export function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
