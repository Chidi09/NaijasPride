import test from "node:test";
import assert from "node:assert/strict";
import {
  parse1337xBookDetailHtml,
  parse1337xBookListingHtml,
} from "./auto-library-discovery.service";

test("parse1337xBookListingHtml extracts rows and audiobook/format hints", () => {
  const html = `
    <table class="table-list">
      <tbody>
        <tr>
          <td class="name">
            <a href="/cat/other">Other</a>
            <a href="/torrent/1/Fourth.Wing.Rebecca.Yarros.2023.EPUB/">Fourth.Wing.Rebecca.Yarros.2023.EPUB</a>
          </td>
          <td class="seeds">420</td>
          <td class="leeches">12</td>
        </tr>
        <tr>
          <td class="name">
            <a href="/cat/other">Other</a>
            <a href="/torrent/2/Fourth.Wing.Audiobook.M4B/">Fourth.Wing.Audiobook.M4B</a>
          </td>
          <td class="seeds">55</td>
          <td class="leeches">3</td>
        </tr>
      </tbody>
    </table>
  `;

  const parsed = parse1337xBookListingHtml(html, "https://www.1377x.to");
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].format, "EPUB");
  assert.equal(parsed[0].isAudiobook, false);
  assert.equal(parsed[0].seeds, 420);
  assert.equal(parsed[1].isAudiobook, true);
});

test("parse1337xBookDetailHtml extracts magnet link", () => {
  const html = `
    <a href="magnet:?xt=urn:btih:ABCDEF1234567890&dn=Fourth+Wing">Magnet Download</a>
  `;

  const parsed = parse1337xBookDetailHtml(html);
  assert.equal(
    parsed.magnetLink,
    "magnet:?xt=urn:btih:ABCDEF1234567890&dn=Fourth+Wing",
  );
});
