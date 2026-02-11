import assert from 'node:assert/strict';
import test from 'node:test';
import { MangabuddySource } from './mangabuddy.source';

const SERIES_ID = 'manga/solo-leveling';
const CHAPTER_ID = 'manga/solo-leveling/chapter-200';

test('MangabuddySource extracts slugs from paths', () => {
  const source = new MangabuddySource() as any;

  // Test slug extraction (Kotatsu Madtheme style)
  assert.equal(source.extractSlugFromPath(`/${SERIES_ID}`), SERIES_ID);
  assert.equal(source.extractSlugFromPath(SERIES_ID), SERIES_ID);
  assert.equal(source.extractSlugFromPath(`/${CHAPTER_ID}`), CHAPTER_ID);
  assert.equal(source.extractSlugFromPath(CHAPTER_ID), CHAPTER_ID);
});
