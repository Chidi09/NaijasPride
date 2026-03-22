#!/usr/bin/env node
/**
 * Audit YouTube movie titles in the DB.
 * Run on the production server:
 *   cd /opt/naijaspride && node apps/api/scripts/audit-youtube-titles.js
 *
 * Outputs:
 *   1. Sample of raw titles that our normalizer still leaves noisy
 *   2. Frequency table of residual noise patterns
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

// ── Inline normalizer (keep in sync with shared-utils/src/formatters.ts) ──
function looksLikeActorList(s) {
  const trimmed = s.trim();
  if (!trimmed.includes(',')) return false;
  const tokens = trimmed.split(',').map((t) => t.trim());
  const nameTokens = tokens.filter((t) =>
    /^[A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+){0,3}$/.test(t),
  );
  return nameTokens.length >= Math.ceil(tokens.length * 0.5);
}

function normalizeYouTubeTitle(raw) {
  if (!raw) return raw;
  const isNoise = (s) =>
    /\b(full\s+movie|full\s+film|official\s+movie|nollywood|hollywood|bollywood|yoruba|igbo|hausa|african|naija|4k|uhd|fhd|hd|1080p|720p|latest\s+movie|latest\s+film|nigerian\s+movie|nigerian\s+film|village\s+nigerian)\b/i.test(s);
  const strongSegments = raw.split(/\s*[|~–—]\s*/);
  const strongCandidate =
    strongSegments.find((seg) => seg.trim().length > 0 && !isNoise(seg.trim())) ??
    strongSegments[0];
  let title = strongCandidate.trim();
  const dashParts = title.split(/\s+-\s+/);
  if (dashParts.length > 1) {
    const afterFirst = dashParts.slice(1).join(' - ');
    if (isNoise(afterFirst) || looksLikeActorList(afterFirst)) title = dashParts[0].trim();
  }
  title = title.replace(
    /^(?:latest|new|best|top)\s+(?:nollywood|yoruba|igbo|hausa|african|naija|hollywood|bollywood)?\s*(?:full\s+)?(?:movies?|films?)?\s*[-–—]?\s*/gi,
    '',
  );
  title = title.replace(/,\s*(?:[A-Z][a-z]+\.?\s+){1,3}[A-Z][a-zA-Z]+.*$/, '').trim();
  title = title.replace(/\{[^}]*\}/g, '');
  title = title.replace(/#\w+/g, '');
  const noisePhrases = [
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
  ];
  for (const re of noisePhrases) title = title.replace(re, '');
  title = title.replace(/[\[(]\s*(?:19|20)\d{2}\s*[\])]/g, '');
  title = title.replace(/\b(?:19|20)\d{2}\b/g, '');
  title = title.replace(/[\[(]\s*[a-z]{2,5}\s*[\])]/gi, '');
  title = title.replace(/[\[(]\s*[\])]/g, '');
  title = title.replace(/\s{2,}/g, ' ').trim();
  title = title.replace(/^[-–—:,.\s]+|[-–—:,.\s]+$/g, '').trim();
  const letters = title.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 3) {
    const upperRatio = (letters.match(/[A-Z]/g) || []).length / letters.length;
    if (upperRatio > 0.6)
      title = title.toLowerCase().replace(/(?:^|\s|[-–—(])\S/g, (ch) => ch.toUpperCase());
  }
  return title || raw.trim();
}

// ── Heuristic: does the normalized title still look noisy? ────────────────
const RESIDUAL_PATTERNS = [
  { label: 'actor names remain (comma Name Name)', re: /,\s+[A-Z][a-z]+ [A-Z][a-z]+/ },
  { label: 'year still present', re: /\b(?:19|20)\d{2}\b/ },
  { label: 'quality tag', re: /\b(4k|uhd|fhd|hd|1080p|720p)\b/i },
  { label: '"latest" noise', re: /\blatest\b/i },
  { label: '"Full Movie/Film"', re: /\bfull\s+(movie|film)\b/i },
  { label: 'nollywood/nigerian noise', re: /\b(nollywood|nigerian|naija|yoruba|igbo|hausa)\b/i },
  { label: 'channel code in parens', re: /\(\s*[a-z]{2,6}\s*\)/i },
  { label: 'empty parens/brackets', re: /[\[(]\s*[\])]/ },
  { label: '"Village" noise', re: /\bvillage\b/i },
  { label: 'part/episode number', re: /\b(?:pt|part|ep|episode)\s*\d+\b/i },
  { label: 'season number', re: /\bseason\s*\d+\b/i },
  { label: 'network name (Netflix/Amazon)', re: /\b(netflix|amazon|prime|disney)\b/i },
  { label: 'clickbait opener', re: /^(a\s+man\s+who|a\s+woman\s+who|she\s+|he\s+|when\s+a\s+)/i },
  { label: 'hashtag remaining', re: /#\w+/ },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.movie.findMany({
      where: { youtubeId: { not: null } },
      select: { title: true },
      take: 2000,
      orderBy: { createdAt: 'desc' },
    });

    console.log(`\nAnalysing ${rows.length} YouTube movie titles...\n`);

    const patternCounts = Object.fromEntries(RESIDUAL_PATTERNS.map((p) => [p.label, 0]));
    const examples = Object.fromEntries(RESIDUAL_PATTERNS.map((p) => [p.label, []]));
    let cleanCount = 0;

    for (const { title: raw } of rows) {
      const normalized = normalizeYouTubeTitle(raw);
      let noisy = false;

      for (const { label, re } of RESIDUAL_PATTERNS) {
        if (re.test(normalized)) {
          patternCounts[label]++;
          if (examples[label].length < 5) {
            examples[label].push({ raw: raw.slice(0, 80), normalized: normalized.slice(0, 80) });
          }
          noisy = true;
        }
      }

      if (!noisy) cleanCount++;
    }

    console.log('── Residual noise pattern frequency ──────────────────────────────');
    const sorted = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);
    for (const [label, count] of sorted) {
      if (count === 0) continue;
      const pct = ((count / rows.length) * 100).toFixed(1);
      console.log(`  ${String(count).padStart(4)}  (${pct.padStart(5)}%)  ${label}`);
      for (const ex of examples[label].slice(0, 3)) {
        console.log(`           RAW: ${ex.raw}`);
        console.log(`           OUT: ${ex.normalized}`);
      }
      console.log();
    }

    const cleanPct = ((cleanCount / rows.length) * 100).toFixed(1);
    console.log(`── Summary ────────────────────────────────────────────────────────`);
    console.log(`  Clean titles : ${cleanCount} / ${rows.length} (${cleanPct}%)`);
    console.log(`  Still noisy  : ${rows.length - cleanCount} / ${rows.length} (${(100 - +cleanPct).toFixed(1)}%)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
