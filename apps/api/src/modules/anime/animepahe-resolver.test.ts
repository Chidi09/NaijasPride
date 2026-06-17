import test from "node:test";
import assert from "node:assert/strict";
import {
  computeAnimepaheReleasePage,
  extractAnimepaheM3u8FromHtml,
} from "./animepahe-resolver";

test("computeAnimepaheReleasePage matches expected page math", () => {
  assert.equal(computeAnimepaheReleasePage(69, 12, 366), 3);
  assert.equal(computeAnimepaheReleasePage(1, 7, 84), 1);
});

test("extractAnimepaheM3u8FromHtml returns direct m3u8 when present", () => {
  const html =
    '<html><body><script>var u="https://kisa-01.example.org/hls/a/b/c/owo.m3u8";</script></body></html>';
  const result = extractAnimepaheM3u8FromHtml(html);
  assert.equal(result, "https://kisa-01.example.org/hls/a/b/c/owo.m3u8");
});

test("extractAnimepaheM3u8FromHtml returns null for unrelated html", () => {
  const html = "<html><body><h1>No stream here</h1></body></html>";
  const result = extractAnimepaheM3u8FromHtml(html);
  assert.equal(result, null);
});
