import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInfoHash,
  extractYearFromTitle,
  normalizeTorrentTitle,
  parseTorrentDetail,
  parseTorrentListing,
  toMovieSlug,
} from './torrent-discovery.service';

test('parseTorrentListing extracts table rows and normalizes titles', () => {
  const html = `
    <table class="table-list">
      <tbody>
        <tr>
          <td class="name"><a href="/cat/movies">Movies</a><a href="/torrent/1/Some.Movie.2025.1080p.WEBRip.x265/">Some.Movie.2025.1080p.WEBRip.x265</a></td>
          <td class="seeds">123</td>
          <td class="leeches">45</td>
        </tr>
      </tbody>
    </table>
  `;

  const rows = parseTorrentListing(html, 'https://www.1377x.to/popular-movies-week', 5);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detailUrl, 'https://www.1377x.to/torrent/1/Some.Movie.2025.1080p.WEBRip.x265/');
  assert.equal(rows[0].year, 2025);
  assert.equal(rows[0].normalizedTitle, 'Some Movie');
  assert.equal(rows[0].seeds, 123);
  assert.equal(rows[0].leeches, 45);
});

test('parseTorrentDetail extracts detail title and magnet link', () => {
  const html = `
    <div class="torrent-detail-info"><h3>Marty Supreme</h3></div>
    <a href="magnet:?xt=urn:btih:5036F4371F2E015CE12E72972363A94B2AAE8F64&dn=Marty">Magnet Download</a>
  `;

  const parsed = parseTorrentDetail(html);
  assert.equal(parsed.detailTitle, 'Marty Supreme');
  assert.ok(parsed.magnetLink?.startsWith('magnet:?xt=urn:btih:5036F4371F2E015CE12E72972363A94B2AAE8F64'));
  assert.equal(extractInfoHash(parsed.magnetLink || ''), '5036F4371F2E015CE12E72972363A94B2AAE8F64');
});

test('helpers normalize title, year, and slug', () => {
  assert.equal(normalizeTorrentTitle('The.Huntsman.2026.1080p.WEBRip.10Bit.DDP.5.1.x265-NeoNoir'), 'The Huntsman');
  assert.equal(extractYearFromTitle('The.Huntsman.2026.1080p.WEBRip'), 2026);
  assert.equal(toMovieSlug('The Huntsman', 2026), 'the-huntsman-2026');
});
