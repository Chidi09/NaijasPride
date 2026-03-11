import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMediaCandidatesFromText } from './embed-stream-resolver';

test('extractMediaCandidatesFromText prefers m3u8 and removes duplicates', () => {
  const html = `
    <script>
      const one = "https://cdn.example.com/hls/abc/master.m3u8";
      const two = "https://cdn.example.com/video/abc-720.mp4";
      const dupe = "https://cdn.example.com/hls/abc/master.m3u8";
    </script>
  `;

  const candidates = extractMediaCandidatesFromText(html);
  assert.deepEqual(candidates, [
    { url: 'https://cdn.example.com/hls/abc/master.m3u8', isM3U8: true },
    { url: 'https://cdn.example.com/video/abc-720.mp4', isM3U8: false },
  ]);
});

test('extractMediaCandidatesFromText returns empty array for text with no media links', () => {
  const candidates = extractMediaCandidatesFromText('<html><body>No stream here</body></html>');
  assert.deepEqual(candidates, []);
});
