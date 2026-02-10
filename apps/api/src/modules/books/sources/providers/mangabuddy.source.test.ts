import assert from 'node:assert/strict';
import test from 'node:test';
import { MangabuddySource } from './mangabuddy.source';

const SERIES_ID = 'manga/solo-leveling';
const CHAPTER_ID = 'manga/solo-leveling/chapter-200';

test('MangabuddySource extracts and coerces minimal series/chapter IDs', () => {
  const source = new MangabuddySource() as any;

  assert.equal(source.extractSeriesId(`/${SERIES_ID}`), SERIES_ID);
  assert.equal(source.coerceSeriesId(`/${SERIES_ID}`), SERIES_ID);
  assert.equal(source.toSeriesPath(SERIES_ID), `/${SERIES_ID}`);

  assert.equal(source.extractChapterId(`/${CHAPTER_ID}`), CHAPTER_ID);
  assert.equal(source.coerceChapterId(`/${CHAPTER_ID}`), CHAPTER_ID);
  assert.equal(source.toChapterPath(CHAPTER_ID), `/${CHAPTER_ID}`);
});
