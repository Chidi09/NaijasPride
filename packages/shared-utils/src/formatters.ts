/**
 * Normalizes a raw YouTube video title (typically from Nollywood channels) by
 * stripping pipe/tilde/dash-separated metadata segments, actor lists, channel
 * codes, noise keywords, quality labels, and year tokens so we're left with
 * just the movie name.
 */
export function normalizeYouTubeTitle(raw: string): string {
  if (!raw) return raw;

  // ── Step 0: extract title from the common Village Nigerian channel template ─
  // "(FULL MOVIE) - New Released Movie Today (ACTUAL TITLE) Village Nigerian..."
  // "() - New Released Movie Today (ACTUAL TITLE) Village Nigerian..."
  // "(2026) - New Released Movie Today (ACTUAL TITLE) Village Nigerian..."
  const villageTemplate = raw.match(
    /^\s*\([^)]*\)\s*[-–]?\s*(?:new\s+released?\s+movie\s+today\s+)?\(([^)]{3,40})\)\s*(?:village|nigerian|nollywood)/i,
  );
  if (villageTemplate?.[1]) {
    return applyTitleCase(villageTemplate[1].trim());
  }

  // Noise detector — true when a segment is clearly metadata, not a title.
  const isNoise = (s: string) =>
    /\b(full\s+movie|full\s+film|official\s+movie|nollywood|hollywood|bollywood|yoruba|igbo|hausa|african|naija|4k|uhd|fhd|hd|1080p|720p|latest\s+movie|latest\s+film|nigerian\s+movie|nigerian\s+film|village\s+nigerian)\b/i.test(
      s,
    );

  // ── Step 1: split on strong separators: pipe, tilde, em/en-dash, slash ────
  const strongSegments = raw.split(/\s*[|~–—]\s*/);
  const strongCandidate =
    strongSegments.find(
      (seg) => seg.trim().length > 0 && !isNoise(seg.trim()),
    ) ?? strongSegments[0];

  let title = strongCandidate.trim();

  // ── Step 2: split on " - " or "--" (dash separators) ────────────────────
  // Only strip the tail when it looks like actors/noise.
  const dashParts = title.split(/\s*--\s*|\s+-\s+/);
  if (dashParts.length > 1) {
    const head = dashParts[0].trim();
    const afterFirst = dashParts.slice(1).join(" - ");
    // If head is entirely noise (e.g. "(FULL MOVIE)"), try to use the tail.
    const headClean = head
      .replace(/\bfull\s+(?:movie|film)\b/gi, "")
      .replace(/[()[\]\s]/g, "");
    if (headClean.length < 3 && head.length > 0) {
      // Head is pure noise — fall through and strip from the tail instead
    } else if (isNoise(afterFirst) || looksLikeActorList(afterFirst)) {
      title = head;
    }
  }

  // ── Step 3: strip actor names appended after a slash (e.g. "Title/ Actor Name") ─
  title = title.replace(/\s*\/\s*[A-Z][a-zA-Z]+\s+[A-Z][a-zA-Z]+.*$/, "");

  // ── Step 4: strip leading noise prefixes ─────────────────────────────────
  title = title.replace(
    /^(?:latest|new|best|top)\s+(?:nollywood|yoruba|igbo|hausa|african|naija|hollywood|bollywood)?\s*(?:full\s+)?(?:movies?|films?)?\s*[-–—]?\s*/gi,
    "",
  );
  // Also strip standalone "(FULL MOVIE) -" prefix that wasn't caught above
  title = title.replace(
    /^\s*\(?\s*full\s+(?:movie|film)\s*\)?\s*[-–—]?\s*/gi,
    "",
  );

  // ── Step 5: strip trailing actor list after first comma ──────────────────
  // Handles both Title-cased and ALL-CAPS actor names:
  // "Innocent Blood, Sylvester Madu..." or "THAT ONE NIGHT, MAURICE SAM..."
  title = title
    .replace(/,\s*(?:[A-Za-z][a-zA-Z]+\.?\s+){1,3}[A-Za-z][a-zA-Z]+.*$/, "")
    .trim();

  // ── Step 6: remove {curly brace content} and #hashtags ───────────────────
  title = title.replace(/\{[^}]*\}/g, "").replace(/#\w+/g, "");

  // ── Step 7: strip noise keywords ─────────────────────────────────────────
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
    /\bnigerian\s+(?:movies?|films?|epic)?\b/gi,
    /\bvillage\s+nigerian\b/gi,
    /\blatest\s+nigerian\b/gi,
    /\b(?:latest|new)\s+(?:movies?|films?|releases?)\b/gi,
    /\b(?:4k|uhd|fhd|full\s+hd|1080p|720p|480p|hd)\b/gi,
    /\bnew\s+released?\s+movie\s+today\b/gi,
    /\ba\s+must\s+watch\b/gi,
  ];

  for (const re of noisePhrases) {
    title = title.replace(re, "");
  }

  // ── Step 8: remove year tokens and empty brackets left behind ─────────────
  title = title.replace(/[\[(]\s*(?:19|20)\d{2}\s*[\])]/g, ""); // (2024) [2024]
  title = title.replace(/\b(?:19|20)\d{2}\b/g, ""); // bare 2024
  title = title.replace(/[\[(]\s*[a-z]{2,5}\s*[\])]/gi, ""); // (lgp) [ctm] channel codes
  title = title.replace(/[\[(]\s*[\])]/g, ""); // empty () []

  // ── Step 9: collapse whitespace and strip trailing/leading punctuation ────
  title = title.replace(/\s{2,}/g, " ").trim();
  title = title.replace(/^[-–—:,.\s]+|[-–—:,.\s]+$/g, "").trim();

  // ── Step 10: title-case ALL-CAPS titles ──────────────────────────────────
  title = applyTitleCase(title);

  return title || raw.trim();
}

function applyTitleCase(s: string): string {
  const letters = s.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 4) return s;
  const ratio = (letters.match(/[A-Z]/g) || []).length / letters.length;
  if (ratio > 0.6)
    // Lookbehind so separator is NOT consumed: "(father)" → "(Father)"
    return s
      .toLowerCase()
      .replace(/(?:^|(?<=[\s(\-–—]))[a-z]/g, (ch) => ch.toUpperCase());
  return s;
}

/**
 * Heuristic: returns true when a string looks like a comma-separated list of
 * actor names possibly followed by noise. Detects patterns like:
 * "Zubby Michael, Ken Erics, Full Movies"  or  "NADIA BUARI, PEARL SHIM, BLOSSOM OKPALEKE latest"
 */
function looksLikeActorList(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed.includes(",")) return false;
  const tokens = trimmed.split(",").map((t) => t.trim());
  // Count tokens that look like a name (1-4 capitalized/all-caps words)
  const nameTokens = tokens.filter((t) =>
    /^[A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+){0,3}$/.test(t),
  );
  return nameTokens.length >= Math.ceil(tokens.length * 0.5);
}

export function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
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
