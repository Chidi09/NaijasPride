import assert from 'node:assert/strict';
import test from 'node:test';
import { BatoSource } from './bato.source';

const SERIES_ID = '12345-series-name';
const CHAPTER_ID = 'abcDEF123';

test('BatoSource extracts and coerces series IDs', () => {
  const source = new BatoSource() as any;

  assert.equal(source.extractSeriesId(`/series/${SERIES_ID}`), SERIES_ID);
  assert.equal(source.extractSeriesId(`https://bato.to/series/${SERIES_ID}?foo=bar`), SERIES_ID);
  assert.equal(source.coerceSeriesId(SERIES_ID), SERIES_ID);
  assert.equal(source.coerceSeriesId(`/series/${SERIES_ID}`), SERIES_ID);
  assert.equal(source.toSeriesPath(SERIES_ID), `/series/${SERIES_ID}`);
});

test('BatoSource extracts and coerces chapter IDs', () => {
  const source = new BatoSource() as any;

  assert.equal(source.extractChapterId(`/chapter/${CHAPTER_ID}`), CHAPTER_ID);
  assert.equal(source.extractChapterId(`https://bato.to/chapter/${CHAPTER_ID}/`), CHAPTER_ID);
  assert.equal(source.coerceChapterId(CHAPTER_ID), CHAPTER_ID);
  assert.equal(source.coerceChapterId(`/chapter/${CHAPTER_ID}`), CHAPTER_ID);
  assert.equal(source.toChapterPath(CHAPTER_ID), `/chapter/${CHAPTER_ID}`);
});
