import assert from "node:assert/strict";
import test from "node:test";
import { AsuraSource } from "./asura.source";

type AsuraTestHarness = {
  extractSeriesId(value: string): string | null;
  coerceSeriesId(value: string): string | null;
  toSeriesPath(value: string): string;
  extractChapterId(value: string): string | null;
  coerceChapterId(value: string): string | null;
  toChapterPath(value: string): string;
};

const SERIES_ID = "absolute-sword-sense";
const CHAPTER_ID = "chapter-129";

test("AsuraSource extracts and coerces minimal series/chapter IDs", () => {
  const source = new AsuraSource() as unknown as AsuraTestHarness;

  assert.equal(source.extractSeriesId(`/series/${SERIES_ID}`), SERIES_ID);
  assert.equal(source.coerceSeriesId(`/series/${SERIES_ID}`), SERIES_ID);
  assert.equal(source.toSeriesPath(SERIES_ID), `/series/${SERIES_ID}`);

  assert.equal(source.extractChapterId(`/chapter/${CHAPTER_ID}`), CHAPTER_ID);
  assert.equal(source.coerceChapterId(`/chapter/${CHAPTER_ID}`), CHAPTER_ID);
  assert.equal(source.toChapterPath(CHAPTER_ID), `/chapter/${CHAPTER_ID}`);
});
