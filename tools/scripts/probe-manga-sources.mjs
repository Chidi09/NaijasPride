#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);

const getArgValue = (flag) => {
  const idx = args.indexOf(flag);
  if (idx < 0) return undefined;
  return args[idx + 1];
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const inputPath = getArgValue('--input');
if (!inputPath) {
  process.stderr.write('Missing required argument: --input <path-to-index-json>\n');
  process.exit(1);
}

const outDir = getArgValue('--out-dir');
const timeoutMs = toNumber(getArgValue('--timeout-ms'), 12000);
const concurrency = Math.max(1, Math.floor(toNumber(getArgValue('--concurrency'), 20)));
const starterLimit = Math.floor(toNumber(getArgValue('--starter-limit'), 20));
const include4xx = args.includes('--include-4xx');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isChallengeBody = (body) => {
  const normalized = (body || '').toLowerCase();
  return (
    normalized.includes('cdn-cgi/challenge-platform') ||
    normalized.includes('cf-browser-verification') ||
    normalized.includes('just a moment...') ||
    normalized.includes('attention required') ||
    normalized.includes('sorry, you have been blocked')
  );
};

const probeOne = async (family, source, timeout) => {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(source.baseUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'NaijasPrideSourceProbe/1.0',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const text = await response.text();
    const latencyMs = Date.now() - startedAt;
    const challengeDetected = isChallengeBody(text) || response.status === 403 || response.status === 503;
    const statusOk = include4xx ? response.status >= 200 && response.status < 500 : response.status >= 200 && response.status < 400;

    return {
      family,
      id: source.id,
      displayName: source.displayName,
      baseUrl: source.baseUrl,
      ok: statusOk && !challengeDetected,
      status: response.status,
      challengeDetected,
      latencyMs,
      message: !statusOk ? `status ${response.status}` : challengeDetected ? 'cloudflare-challenge' : 'ok',
    };
  } catch (error) {
    return {
      family,
      id: source.id,
      displayName: source.displayName,
      baseUrl: source.baseUrl,
      ok: false,
      status: null,
      challengeDetected: false,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'request-failed',
    };
  } finally {
    clearTimeout(timer);
  }
};

const runWithConcurrency = async (items, limit, worker) => {
  const queue = [...items];
  const output = [];

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      output.push(await worker(next));
      await sleep(25);
    }
  });

  await Promise.all(runners);
  return output;
};

const buildStarterRoundRobin = (passedByFamily, limit) => {
  const familyNames = Object.keys(passedByFamily).sort();
  const pools = Object.fromEntries(
    familyNames.map((family) => [family, [...passedByFamily[family]].sort((a, b) => a.latencyMs - b.latencyMs)])
  );

  const picked = [];
  while (picked.length < limit) {
    let pickedAny = false;
    for (const family of familyNames) {
      const next = pools[family].shift();
      if (!next) continue;
      picked.push(next);
      pickedAny = true;
      if (picked.length >= limit) break;
    }
    if (!pickedAny) break;
  }

  const grouped = {};
  for (const family of familyNames) grouped[family] = [];
  for (const item of picked) {
    grouped[item.family].push({
      id: item.id,
      displayName: item.displayName,
      baseUrl: item.baseUrl,
    });
  }
  return grouped;
};

const toEnvKey = (family) => `${family.toUpperCase()}_SOURCES_JSON`;

const writeOutputs = async (dir, report) => {
  await fs.mkdir(dir, { recursive: true });

  const passOnly = {};
  for (const family of report.families) {
    passOnly[family] = report.results
      .filter((item) => item.family === family && item.ok)
      .map((item) => ({ id: item.id, displayName: item.displayName, baseUrl: item.baseUrl }));
  }

  const starter = buildStarterRoundRobin(
    Object.fromEntries(report.families.map((family) => [family, report.results.filter((item) => item.family === family && item.ok)])),
    starterLimit
  );

  await fs.writeFile(path.join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(dir, 'passed.json'), `${JSON.stringify(passOnly, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(dir, `starter-${starterLimit}.json`), `${JSON.stringify(starter, null, 2)}\n`, 'utf8');

  const passEnv = report.families
    .map((family) => `${toEnvKey(family)}=${JSON.stringify(passOnly[family])}`)
    .join('\n');
  await fs.writeFile(path.join(dir, 'passed.env.snippet'), `${passEnv}\n`, 'utf8');

  const starterEnv = report.families
    .map((family) => `${toEnvKey(family)}=${JSON.stringify(starter[family] || [])}`)
    .join('\n');
  await fs.writeFile(path.join(dir, `starter-${starterLimit}.env.snippet`), `${starterEnv}\n`, 'utf8');
};

const run = async () => {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw);

  const sourceMap = parsed.sources && typeof parsed.sources === 'object' ? parsed.sources : {};
  const families = Object.keys(sourceMap);
  const tasks = [];
  for (const family of families) {
    for (const source of sourceMap[family] || []) {
      if (!source?.baseUrl || !source?.id || !source?.displayName) continue;
      tasks.push({ family, source });
    }
  }

  if (tasks.length === 0) {
    throw new Error('No sources found in input payload');
  }

  const startedAt = Date.now();
  const results = await runWithConcurrency(tasks, concurrency, ({ family, source }) => probeOne(family, source, timeoutMs));

  const counts = Object.fromEntries(
    families.map((family) => {
      const scoped = results.filter((item) => item.family === family);
      const ok = scoped.filter((item) => item.ok).length;
      return [family, { total: scoped.length, ok, failed: scoped.length - ok }];
    })
  );

  const report = {
    inputPath,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    timeoutMs,
    concurrency,
    include4xx,
    families,
    counts,
    results,
  };

  process.stdout.write(`${JSON.stringify({ counts, total: results.length }, null, 2)}\n`);

  if (outDir) {
    await writeOutputs(outDir, report);
    process.stdout.write(`Wrote probe artifacts to ${outDir}\n`);
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
