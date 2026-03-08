import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WeebCentralSource } from './weebcentral.source';

type WeebCentralTestHarness = {
  extractSeriesId(value: string): string | null;
  coerceSeriesId(value: string): string | null;
  toSeriesPath(value: string): string;
  extractChapterId(value: string): string | null;
  coerceChapterId(value: string): string | null;
  toChapterPath(value: string): string;
};

const SERIES_ID = '01JJ2D2B46DZ8QYPVGNVC63V3E';
const CHAPTER_ID = '01KH3X48WCP664NG6DNS7TQTB8';

const fixture = (name: string) =>
  readFileSync(resolve(process.cwd(), 'src/modules/books/sources/providers/parsers/__fixtures__', name), 'utf8');

test('WeebCentralSource extracts and coerces series IDs to ULID format', () => {
  const source = new WeebCentralSource() as unknown as WeebCentralTestHarness;

  assert.equal(source.extractSeriesId(`/series/${SERIES_ID}/Absolute-Sword-Sense`), SERIES_ID);
  assert.equal(source.extractSeriesId(`https://weebcentral.com/series/${SERIES_ID}`), SERIES_ID);
  assert.equal(source.coerceSeriesId(SERIES_ID), SERIES_ID);
  assert.equal(source.coerceSeriesId(`/series/${SERIES_ID}/Absolute-Sword-Sense`), SERIES_ID);
  assert.equal(source.toSeriesPath(SERIES_ID), `/series/${SERIES_ID}`);
});

test('WeebCentralSource extracts and coerces chapter IDs to ULID format', () => {
  const source = new WeebCentralSource() as unknown as WeebCentralTestHarness;

  assert.equal(source.extractChapterId(`/chapters/${CHAPTER_ID}`), CHAPTER_ID);
  assert.equal(source.extractChapterId(`https://weebcentral.com/chapters/${CHAPTER_ID}/`), CHAPTER_ID);
  assert.equal(source.coerceChapterId(CHAPTER_ID), CHAPTER_ID);
  assert.equal(source.coerceChapterId(`/chapters/${CHAPTER_ID}`), CHAPTER_ID);
  assert.equal(source.toChapterPath(CHAPTER_ID), `/chapters/${CHAPTER_ID}`);
});

test('WeebCentralSource rejects non-ULID series/chapter inputs', () => {
  const source = new WeebCentralSource() as unknown as WeebCentralTestHarness;

  assert.equal(source.coerceSeriesId('/series/not-a-ulid/some-title'), null);
  assert.equal(source.coerceChapterId('/chapters/123'), null);
});

test('WeebCentralSource page parser prefers data-src and drops broken placeholders', async () => {
  const source = new WeebCentralSource() as any;
  source.fetchHtml = async () => fixture('weebcentral-chapter-broken-src.html');
  source.getFromCache = async () => null;
  source.setCache = async () => undefined;

  const result = await source.getChapterPages(CHAPTER_ID);

  assert.deepEqual(result.pages, [
    'https://cdn.weebcentral.com/chapters/alpha/001.webp',
    'https://cdn.weebcentral.com/chapters/alpha/002.webp',
  ]);
});
