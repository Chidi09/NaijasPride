import assert from "node:assert/strict";
import test from "node:test";
import {
  pickPreferredElsciFile,
  selectElsciLightNovelFiles,
  type ElsciCatalogItem,
  type ElsciLightNovelFile,
} from "./elsci-lightnovels";

test("selectElsciLightNovelFiles keeps EPUB over PDF duplicates", () => {
  const items: ElsciCatalogItem[] = [
    {
      href: "/Officially%20Translated%20Light%20Novels/86/86%20Vol%2001%20%5BYen%20Press%5D.epub",
      time: 1700001000000,
      size: 1024,
    },
    {
      href: "/Officially%20Translated%20Light%20Novels/86/86%20Vol%2001%20%5BYen%20Press%5D.pdf",
      time: 1700002000000,
      size: 2048,
    },
    {
      href: "/Officially%20Translated%20Light%20Novels/86/86%20Vol%2002%20%5BYen%20Press%5D.pdf",
      time: 1700003000000,
      size: 4096,
    },
  ];

  const selected = selectElsciLightNovelFiles(items, {
    baseUrl: "https://server.elsci.one",
    rootPath: "/Officially%20Translated%20Light%20Novels/",
    maxFiles: 10,
    formatPreference: "epub",
  });

  assert.equal(selected.length, 2);
  const volumeOne = selected.find((entry) => entry.title.includes("Vol 01"));
  assert.ok(volumeOne);
  assert.equal(volumeOne?.format, "EPUB");
});

test("selectElsciLightNovelFiles honors include and exclude patterns", () => {
  const items: ElsciCatalogItem[] = [
    {
      href: "/Officially%20Translated%20Light%20Novels/Ascendance/Ascendance%20Volume%2001%20%5BJ-Novel%5D.epub",
      time: 1700000000000,
      size: 1500,
    },
    {
      href: "/Officially%20Translated%20Light%20Novels/Ascendance/Ascendance%20Volume%2002%20%5BAudiobook%5D.pdf",
      time: 1700000000100,
      size: 2500,
    },
  ];

  const selected = selectElsciLightNovelFiles(items, {
    baseUrl: "https://server.elsci.one",
    rootPath: "/Officially%20Translated%20Light%20Novels/",
    maxFiles: 10,
    formatPreference: "any",
    includePattern: "ascendance",
    excludePattern: "audiobook",
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.title, "Ascendance Volume 01");
});

test("pickPreferredElsciFile prioritizes requested format first", () => {
  const epub: ElsciLightNovelFile = {
    href: "/Officially%20Translated%20Light%20Novels/Book/Book%20Vol%2001.epub",
    absoluteUrl:
      "https://server.elsci.one/Officially%20Translated%20Light%20Novels/Book/Book%20Vol%2001.epub",
    title: "Book Vol 01",
    series: "Book",
    fileName: "Book Vol 01.epub",
    format: "EPUB",
    sizeBytes: 1000,
    modifiedAtMs: 100,
  };

  const pdf: ElsciLightNovelFile = {
    ...epub,
    href: "/Officially%20Translated%20Light%20Novels/Book/Book%20Vol%2001.pdf",
    absoluteUrl:
      "https://server.elsci.one/Officially%20Translated%20Light%20Novels/Book/Book%20Vol%2001.pdf",
    fileName: "Book Vol 01.pdf",
    format: "PDF",
    sizeBytes: 9000,
    modifiedAtMs: 900,
  };

  const preferred = pickPreferredElsciFile(epub, pdf, "epub");
  assert.equal(preferred.format, "EPUB");

  const preferredPdf = pickPreferredElsciFile(epub, pdf, "pdf");
  assert.equal(preferredPdf.format, "PDF");
});
