#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_FAMILIES = ['madara', 'mangareader', 'zeistmanga', 'wpcomics', 'mmrcms'];

const args = process.argv.slice(2);

const getArgValue = (flag) => {
  const idx = args.indexOf(flag);
  if (idx < 0) return undefined;
  return args[idx + 1];
};

const hasFlag = (flag) => args.includes(flag);

const parseCsv = (value) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const repoDir =
  getArgValue('--repo') || process.env.KOTATSU_PARSERS_DIR || 'C:/Users/IFEANYI PC/Documents/kotatsu-parsers';
const families = parseCsv(getArgValue('--families') || DEFAULT_FAMILIES.join(',')).map((value) => value.toLowerCase());
const locales = parseCsv(getArgValue('--locale')).map((value) => value.toLowerCase());
const contentTypes = parseCsv(getArgValue('--content-types')).map((value) => value.toLowerCase());
const includeBroken = !hasFlag('--exclude-broken');
const format = (getArgValue('--format') || 'full').trim().toLowerCase();
const dedupeBaseUrl = hasFlag('--dedupe-base-url');
const outputPath = getArgValue('--out');
const splitDir = getArgValue('--split-dir');

const siteRoot = path.join(repoDir, 'src', 'main', 'kotlin', 'org', 'koitharu', 'kotatsu', 'parsers', 'site');

const walk = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
};

const annotationRegex = /@MangaSourceParser\(\s*"([^"]+)"\s*,\s*"([^"]+)"(?:\s*,\s*"([^"]*)")?(?:\s*,\s*ContentType\.([A-Z_]+))?/m;
const brokenRegex = /@Broken\(([^)]*)\)/m;
const domainRegex = /:\s*[A-Za-z0-9_]+Parser\((?:.|\n|\r)*?"([^"]+\.[^"]+)"/m;

const parseBrokenReason = (content) => {
  const brokenMatch = content.match(brokenRegex);
  if (!brokenMatch) return null;

  const messageMatch = brokenMatch[1].match(/"([^"]*)"/);
  return messageMatch?.[1] || 'Marked as broken in Kotatsu';
};

const parseSource = (content) => {
  const annotation = content.match(annotationRegex);
  if (!annotation) return null;

  const sourceName = annotation[1]?.trim();
  const title = annotation[2]?.trim();
  const locale = (annotation[3] || '').trim();
  const contentType = (annotation[4] || 'MANGA').trim();

  const domainMatch = content.match(domainRegex);
  const domainRaw = domainMatch?.[1]?.trim();
  const baseUrl = domainRaw ? (domainRaw.startsWith('http://') || domainRaw.startsWith('https://') ? domainRaw : `https://${domainRaw}`) : null;

  if (!sourceName || !title || !baseUrl) {
    return null;
  }

  return {
    id: sourceName.toLowerCase(),
    displayName: title,
    baseUrl,
    locale: locale || null,
    contentType: contentType.toLowerCase(),
    brokenReason: parseBrokenReason(content),
  };
};

const includeByLocale = (source) => {
  if (locales.length === 0) return true;
  const sourceLocale = (source.locale || '').toLowerCase();
  return locales.includes(sourceLocale);
};

const includeByContentType = (source) => {
  if (contentTypes.length === 0) return true;
  return contentTypes.includes(source.contentType);
};

const includeSource = (source) => {
  if (!includeBroken && source.brokenReason) return false;
  if (!includeByLocale(source)) return false;
  if (!includeByContentType(source)) return false;
  return true;
};

const dedupeById = (items) => {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
};

const dedupeByBaseUrl = (items) => {
  const map = new Map();
  for (const item of items) {
    const key = item.baseUrl.toLowerCase();
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
};

const compactForEnv = (source) => ({
  id: source.id,
  displayName: source.displayName,
  baseUrl: source.baseUrl,
});

const toFamilyPayload = (familyItems) => {
  if (format === 'env') {
    return familyItems.map(compactForEnv);
  }
  return familyItems;
};

const run = async () => {
  const allFiles = await walk(siteRoot);
  const result = {};
  for (const family of families) {
    result[family] = [];
  }

  for (const filePath of allFiles) {
    if (!filePath.endsWith('.kt')) continue;
    if (filePath.endsWith('Parser.kt')) continue;

    const rel = path.relative(siteRoot, filePath);
    const relParts = rel.split(path.sep);
    const family = relParts[0]?.toLowerCase();
    if (!family || !families.includes(family)) continue;

    const content = await fs.readFile(filePath, 'utf8');
    const parsed = parseSource(content);
    if (!parsed) continue;
    if (!includeSource(parsed)) continue;

    result[family].push({
      ...parsed,
      kotatsuFile: rel.replace(/\\/g, '/'),
    });
  }

  for (const family of families) {
    const dedupedById = dedupeById(result[family]);
    const finalList = dedupeBaseUrl ? dedupeByBaseUrl(dedupedById) : dedupedById;
    result[family] = finalList.sort((a, b) => a.id.localeCompare(b.id));
  }

  const transformed = Object.fromEntries(families.map((family) => [family, toFamilyPayload(result[family])]));

  const payload = {
    extractedAt: new Date().toISOString(),
    repoDir,
    families,
    filters: {
      locale: locales,
      contentTypes,
      includeBroken,
      format,
      dedupeBaseUrl,
    },
    counts: Object.fromEntries(families.map((family) => [family, transformed[family].length])),
    sources: transformed,
  };

  const text = JSON.stringify(payload, null, 2);

  if (splitDir) {
    await fs.mkdir(splitDir, { recursive: true });
    for (const family of families) {
      const outFile = path.join(splitDir, `${family}.json`);
      await fs.writeFile(outFile, `${JSON.stringify(transformed[family], null, 2)}\n`, 'utf8');
    }

    const envLines = families.map((family) => {
      const envKey = `${family.toUpperCase()}_SOURCES_JSON`;
      return `${envKey}=${JSON.stringify(transformed[family])}`;
    });
    await fs.writeFile(path.join(splitDir, 'env.snippet'), `${envLines.join('\n')}\n`, 'utf8');
  }

  if (!outputPath) {
    process.stdout.write(`${text}\n`);
    return;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, text, 'utf8');
  process.stdout.write(`Wrote ${outputPath}\n`);
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
