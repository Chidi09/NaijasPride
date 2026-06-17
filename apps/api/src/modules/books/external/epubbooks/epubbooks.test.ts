import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseEpubBooksCatalogPageHtml,
  parseEpubBooksBookDetailHtml,
  pickEpubBooksOffer,
} from "./epubbooks";

const fixture = (name: string) =>
  readFileSync(
    resolve(
      process.cwd(),
      "src/modules/books/external/epubbooks/__fixtures__",
      name,
    ),
    "utf8",
  );

test("parseEpubBooksCatalogPageHtml extracts /book/<id>-<slug> links", () => {
  const html = fixture("catalog-page.html");
  const slugs = parseEpubBooksCatalogPageHtml(html);
  assert.deepEqual(
    slugs.sort(),
    [
      "2263-five-fall-into-adventure",
      "44-pride-and-prejudice",
      "608-the-great-gatsby",
    ].sort(),
  );
});

test("parseEpubBooksBookDetailHtml extracts core metadata and offers", () => {
  const html = fixture("book-detail.html");
  const detail = parseEpubBooksBookDetailHtml("44-pride-and-prejudice", html);

  assert.equal(detail.title, "Pride and Prejudice");
  assert.equal(detail.author, "Jane Austen");
  assert.equal(detail.year, 1813);
  assert.equal(detail.pageCount, 486);
  assert.equal(detail.language, "English");
  assert.equal(detail.publisher, "epubBooks");
  assert.equal(detail.downloadCount, 57218);
  assert.ok(detail.coverUrl?.includes("austen-pride-and-prejudice"));
  assert.deepEqual(detail.subjects, ["Classic Fiction", "Romance"]);

  const epubOffer = pickEpubBooksOffer(detail.offers, "epub");
  assert.ok(epubOffer);
  assert.equal(epubOffer?.dlid, 575);
  assert.ok((epubOffer?.fileSizeBytes || 0) > 1_000_000);

  const kindleOffer = pickEpubBooksOffer(detail.offers, "kindle");
  assert.ok(kindleOffer);
  assert.equal(kindleOffer?.dlid, 885);
});
