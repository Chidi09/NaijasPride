#!/usr/bin/env node
'use strict';
const readline = require('readline');

function looksLikeActorList(s) {
  const trimmed = s.trim();
  if (!trimmed.includes(',')) return false;
  const tokens = trimmed.split(',').map(t => t.trim());
  const nameTokens = tokens.filter(t => /^[A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+){0,3}$/.test(t));
  return nameTokens.length >= Math.ceil(tokens.length * 0.5);
}

function normalize(raw) {
  if (!raw) return raw;
  const isNoise = s =>
    /\b(full\s+movie|full\s+film|official\s+movie|nollywood|hollywood|bollywood|yoruba|igbo|hausa|african|naija|4k|uhd|fhd|hd|1080p|720p|latest\s+movie|latest\s+film|nigerian\s+movie|nigerian\s+film|village\s+nigerian)\b/i.test(s);
  const segs = raw.split(/\s*[|~\u2013\u2014]\s*/);
  const cand = segs.find(s => s.trim().length > 0 && !isNoise(s.trim())) || segs[0];
  let t = cand.trim();
  const dp = t.split(/\s+-\s+/);
  if (dp.length > 1) {
    const after = dp.slice(1).join(' - ');
    if (isNoise(after) || looksLikeActorList(after)) t = dp[0].trim();
  }
  t = t.replace(/^(?:latest|new|best|top)\s+(?:nollywood|yoruba|igbo|hausa|african|naija|hollywood|bollywood)?\s*(?:full\s+)?(?:movies?|films?)?\s*[-\u2013\u2014]?\s*/gi, '');
  t = t.replace(/,\s*(?:[A-Z][a-z]+\.?\s+){1,3}[A-Z][a-zA-Z]+.*$/, '').trim();
  t = t.replace(/\{[^}]*\}/g, '').replace(/#\w+/g, '');
  [
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
  ].forEach(re => { t = t.replace(re, ''); });
  t = t.replace(/[\[(]\s*(?:19|20)\d{2}\s*[\])]/g, '');
  t = t.replace(/\b(?:19|20)\d{2}\b/g, '');
  t = t.replace(/[\[(]\s*[a-z]{2,5}\s*[\])]/gi, '');
  t = t.replace(/[\[(]\s*[\])]/g, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  t = t.replace(/^[-\u2013\u2014:,.\s]+|[-\u2013\u2014:,.\s]+$/g, '').trim();
  const letters = t.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 3 && (letters.match(/[A-Z]/g) || []).length / letters.length > 0.6)
    t = t.toLowerCase().replace(/(?:^|\s|[-\u2013\u2014(])\S/g, ch => ch.toUpperCase());
  return t || raw.trim();
}

const PATTERNS = [
  { label: 'year still present',           re: /\b(?:19|20)\d{2}\b/ },
  { label: 'Full Movie/Film remains',      re: /\bfull\s+(movie|film)\b/i },
  { label: 'nollywood/nigerian noise',     re: /\b(nollywood|nigerian|naija|yoruba|igbo|hausa)\b/i },
  { label: 'quality tag remains',          re: /\b(4k|uhd|hd|1080p|720p)\b/i },
  { label: 'channel code in parens',       re: /\(\s*[a-z]{2,6}\s*\)(?!\s*[A-Z])/i },
  { label: 'empty parens/brackets',        re: /[\[(]\s*[\])]/ },
  { label: 'actor names after comma',      re: /,\s+[A-Z][a-z]+\s+[A-Z][a-z]+/ },
  { label: 'network name in title',        re: /\b(netflix|amazon|prime|disney|showmax)\b/i },
  { label: 'clickbait story opener',       re: /^(how |she |he |when |a man |a woman |the man who|the woman who)/i },
  { label: 'season or episode label',      re: /\b(season|episode|ep\.?)\s*\d+/i },
  { label: 'must watch promo text',        re: /\b(must\s+watch|a\s+must)\b/i },
  { label: '(FULL MOVIE) prefix',          re: /^\s*\(?\s*full\s+movie\s*\)?/i },
  { label: 'village noise remains',        re: /\bvillage\b/i },
  { label: 'hashtag remains',              re: /#\w+/ },
  { label: 'Pt/Part number suffix',        re: /\bpt\.?\s*\d+\b/i },
  { label: 'bracket with all-caps word',   re: /[\[(][A-Z]{3,}[\])]/ },
  { label: 'Fassarar/Hausa title patterns',re: /\b(fassarar|algaita|madugu|sabuwar)\b/i },
];

const counts = Object.fromEntries(PATTERNS.map(p => [p.label, 0]));
const examples = Object.fromEntries(PATTERNS.map(p => [p.label, []]));
const titles = [];

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => { if (line.trim()) titles.push(line.trim()); });
rl.on('close', () => {
  let clean = 0;
  for (const raw of titles) {
    const n = normalize(raw);
    let noisy = false;
    for (const { label, re } of PATTERNS) {
      if (re.test(n)) {
        counts[label]++;
        if (examples[label].length < 5) examples[label].push({ raw: raw.slice(0, 90), n: n.slice(0, 90) });
        noisy = true;
      }
    }
    if (!noisy) clean++;
  }

  console.log('\n── Residual noise after normalization ────────────────────────────────');
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .filter(([, c]) => c > 0)
    .forEach(([label, count]) => {
      const pct = (count / titles.length * 100).toFixed(1);
      console.log(`\n  ${String(count).padStart(4)}  (${pct.padStart(5)}%)  ${label}`);
      examples[label].slice(0, 3).forEach(e => {
        console.log(`     RAW: ${e.raw}`);
        console.log(`     OUT: ${e.n}`);
      });
    });

  console.log('\n── Summary ───────────────────────────────────────────────────────────');
  console.log(`  Total  : ${titles.length}`);
  console.log(`  Clean  : ${clean} (${(clean / titles.length * 100).toFixed(1)}%)`);
  console.log(`  Noisy  : ${titles.length - clean} (${((titles.length - clean) / titles.length * 100).toFixed(1)}%)`);
});
