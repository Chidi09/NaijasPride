import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCandidateResponse,
  normalizeAllowedHosts,
  pickBestStreamCandidate,
  type StreamCandidate,
} from './remote-stream-resolver.service';

test('normalizeAllowedHosts trims, lowercases, and deduplicates', () => {
  const normalized = normalizeAllowedHosts(['  MixDrop.CO  ', 'hydrax.net', 'mixdrop.co', '']);
  assert.deepEqual(normalized, ['mixdrop.co', 'hydrax.net']);
});

test('isCandidateResponse detects HLS and MP4 media responses', () => {
  assert.equal(isCandidateResponse('https://host/video/master.m3u8', 200, 'application/vnd.apple.mpegurl'), true);
  assert.equal(isCandidateResponse('https://host/video/file.mp4', 200, 'video/mp4'), true);
  assert.equal(isCandidateResponse('https://host/script.js', 200, 'application/javascript'), false);
  assert.equal(isCandidateResponse('https://doubleclick.net/track', 200, 'video/mp4'), false);
});

test('pickBestStreamCandidate prefers allowed host and HLS', () => {
  const candidates: StreamCandidate[] = [
    {
      url: 'https://host-a.example/video.mp4',
      host: 'host-a.example',
      status: 200,
      contentType: 'video/mp4',
      kind: 'mp4',
      referer: 'https://page.example',
    },
    {
      url: 'https://host-b.example/master.m3u8',
      host: 'host-b.example',
      status: 200,
      contentType: 'application/vnd.apple.mpegurl',
      kind: 'hls',
      referer: 'https://page.example',
    },
  ];

  const chosen = pickBestStreamCandidate(candidates, ['host-b.example']);
  assert.ok(chosen);
  assert.equal(chosen?.host, 'host-b.example');
  assert.equal(chosen?.kind, 'hls');
});
