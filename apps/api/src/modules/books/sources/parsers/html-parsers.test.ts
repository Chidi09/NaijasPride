import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractChapterImageUrls } from './html-parsers';

const fixture = (name: string) =>
  readFileSync(resolve(process.cwd(), 'src/modules/books/sources/parsers/__fixtures__', name), 'utf8');

test('extractChapterImageUrls parses mixed src/data-src and inline URLs', () => {
  const html = fixture('weebcentral-chapter.html');
  const urls = extractChapterImageUrls(html, (url) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return `https://weebcentral.com${url}`;
    return `https://weebcentral.com/${url}`;
  });

  assert.equal(urls.length, 3);
  assert.ok(urls.some((url) => url.includes('/001.webp')));
  assert.ok(urls.some((url) => url.includes('/002.webp')));
  assert.ok(urls.some((url) => url.includes('/003.webp')));
});

test('extractChapterImageUrls parses protocol-relative URLs', () => {
  const html = fixture('asura-chapter.html');
  const urls = extractChapterImageUrls(html, (url) => {
    if (!url) return null;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://asuracomic.net${url.startsWith('/') ? '' : '/'}${url}`;
  });

  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.startsWith('https://')));
});
