import assert from 'node:assert/strict';
import test from 'node:test';
import { AsuraSource } from './asura.source';

const SERIES_ID = 'absolute-sword-sense';
const CHAPTER_ID = 'chapter-129';

test('AsuraSource extracts and coerces minimal series/chapter IDs', () => {
  const source = new AsuraSource() as any;

  assert.equal(source.extractSeriesId(`/series/${SERIES_ID}`), SERIES_ID);
  assert.equal(source.coerceSeriesId(`/series/${SERIES_ID}`), SERIES_ID);
  assert.equal(source.toSeriesPath(SERIES_ID), `/series/${SERIES_ID}`);

  assert.equal(source.extractChapterId(`/chapter/${CHAPTER_ID}`), CHAPTER_ID);
  assert.equal(source.coerceChapterId(`/chapter/${CHAPTER_ID}`), CHAPTER_ID);
  assert.equal(source.toChapterPath(CHAPTER_ID), `/chapter/${CHAPTER_ID}`);
});
