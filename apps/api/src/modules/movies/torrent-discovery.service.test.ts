import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInfoHash,
  extractYearFromTitle,
  normalizeTorrentTitle,
  parseApibayListingJson,
  parseTorrentDetail,
  parseTorrentListing,
  parseYtsListingJson,
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

test('parseYtsListingJson extracts magnet-ready movie candidates', () => {
  const json = JSON.stringify({
    status: 'ok',
    data: {
      movies: [
        {
          title: 'Delta Force',
          year: 2025,
          url: 'https://yts.mx/movies/delta-force-2025',
          torrents: [
            { hash: 'AA11BB22CC33DD44EE55FF66AA77BB88CC99DD00', quality: '720p', seeds: 50, peers: 12 },
            { hash: 'AB11BB22CC33DD44EE55FF66AA77BB88CC99DD11', quality: '1080p', seeds: 120, peers: 18 },
          ],
        },
      ],
    },
  });

  const rows = parseYtsListingJson(json, 5, 'https://yts.mx/api/v2/list_movies.json');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].normalizedTitle, 'Delta Force');
  assert.equal(rows[0].year, 2025);
  assert.equal(rows[0].seeds, 120);
  assert.ok(rows[0].magnetLink.startsWith('magnet:?xt=urn:btih:AB11BB22CC33DD44EE55FF66AA77BB88CC99DD11'));
});

test('parseApibayListingJson extracts torrent rows with year and hash', () => {
  const json = JSON.stringify([
    {
      id: '12345',
      name: 'Skylight.2024.1080p.BluRay.x264',
      info_hash: 'CD11BB22CC33DD44EE55FF66AA77BB88CC99DD11',
      seeders: '321',
      leechers: '42',
    },
    {
      id: '12346',
      name: 'NoYearMovie.1080p.WEBRip',
      info_hash: 'EF11BB22CC33DD44EE55FF66AA77BB88CC99DD11',
      seeders: '10',
      leechers: '4',
    },
  ]);

  const rows = parseApibayListingJson(json, 10, 'https://apibay.org/precompiled/data_top100_201.json');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].normalizedTitle, 'Skylight');
  assert.equal(rows[0].year, 2024);
  assert.equal(rows[0].infoHash, 'CD11BB22CC33DD44EE55FF66AA77BB88CC99DD11');
  assert.ok(rows[0].magnetLink.startsWith('magnet:?xt=urn:btih:CD11BB22CC33DD44EE55FF66AA77BB88CC99DD11'));
});
