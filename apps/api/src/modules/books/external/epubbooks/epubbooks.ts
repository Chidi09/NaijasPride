import axios from "axios";
import * as cheerio from "cheerio";

export type EpubBooksRequestedFormat = "epub" | "kindle";

export type EpubBooksOffer = {
  label: "EPUB" | "Kindle" | string;
  dlid: number;
  fileSizeBytes: number | null;
  fileSizeLabel: string | null;
};

export type EpubBooksBookDetail = {
  externalSlug: string; // ex: "44-pride-and-prejudice"
  url: string;
  title: string;
  author: string;
  description: string | null;
  year: number | null;
  coverUrl: string | null;
  pageCount: number | null;
  language: string | null;
  publisher: string | null;
  subjects: string[];
  downloadCount: number | null;
  offers: EpubBooksOffer[];
};

const EPUBBOOKS_BASE_URL = "https://www.epubbooks.com";

const DEFAULT_HEADERS = {
  // A boring UA works fine and avoids some bot heuristics.
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
} as const;

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const toAbsoluteUrl = (
  maybeRelative: string | null | undefined,
): string | null => {
  const value = (maybeRelative || "").trim();
  if (!value) return null;
  try {
    return new URL(value, EPUBBOOKS_BASE_URL).toString();
  } catch {
    return null;
  }
};

const parseHumanFileSizeBytes = (
  label: string | null | undefined,
): number | null => {
  const raw = (label || "").trim();
  if (!raw) return null;
  const match = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*(B|KB|MB|GB)/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1] || "");
  if (!Number.isFinite(value)) return null;

  const unit = (match[2] || "").toUpperCase();
  const factor =
    unit === "B"
      ? 1
      : unit === "KB"
        ? 1024
        : unit === "MB"
          ? 1024 ** 2
          : unit === "GB"
            ? 1024 ** 3
            : 1;
  return Math.round(value * factor);
};

const extractYear = (text: string): number | null => {
  const match = text.match(/first\s+published\s+in\s*(\d{4})/i);
  if (!match) return null;
  const year = Number.parseInt(match[1] || "", 10);
  return Number.isFinite(year) ? year : null;
};

const extractPageCount = (text: string): number | null => {
  const match = text.match(/\b(\d{1,5})\s+pages\b/i);
  if (!match) return null;
  const pages = Number.parseInt(match[1] || "", 10);
  return Number.isFinite(pages) ? pages : null;
};

const extractDownloadCount = (
  value: string | null | undefined,
): number | null => {
  const raw = (value || "").trim();
  if (!raw) return null;
  const match = raw.match(/UserDownloads:(\d+)/i);
  if (!match) return null;
  const count = Number.parseInt(match[1] || "", 10);
  return Number.isFinite(count) ? count : null;
};

const parseOfferLabel = (raw: string): string => {
  const label = normalizeWhitespace(raw);
  // The h4 is usually like "EPUB" or "Kindle".
  const firstWord = label.split(" ")[0] || label;
  return firstWord;
};

export const buildEpubBooksBookUrl = (externalSlug: string): string => {
  const normalized = externalSlug.replace(/^\/+/, "").replace(/^book\//, "");
  return new URL(`/book/${normalized}`, EPUBBOOKS_BASE_URL).toString();
};

export const parseEpubBooksBookDetailHtml = (
  externalSlug: string,
  html: string,
): EpubBooksBookDetail => {
  const $ = cheerio.load(html || "");

  const canonical =
    $('link[rel="canonical"]').attr("href") ||
    buildEpubBooksBookUrl(externalSlug);
  const url = toAbsoluteUrl(canonical) || buildEpubBooksBookUrl(externalSlug);

  const title = normalizeWhitespace(
    $('h1[itemprop="name"]').first().text() || $("h1").first().text() || "",
  );
  const author = normalizeWhitespace(
    $('h2.authors [itemprop="author"]').first().text() ||
      $("h2.authors a").first().text() ||
      "",
  );

  const descriptionRaw = $('div[itemprop="description"]').first().text();
  const description = descriptionRaw
    ? normalizeWhitespace(descriptionRaw)
    : null;

  const ogImage = $('meta[property="og:image"]').attr("content");
  const coverUrl =
    toAbsoluteUrl(ogImage) ||
    toAbsoluteUrl($('img[itemprop="image"]').attr("src"));

  const bodyText = normalizeWhitespace($("body").text());
  const year = extractYear(bodyText);
  const pageCount = extractPageCount(bodyText);

  const language =
    $('meta[itemprop="inLanguage"]').attr("content")?.trim() || null;
  const publisher =
    normalizeWhitespace($('span[itemprop="publisher"]').first().text() || "") ||
    null;
  const interactionCount = $('meta[itemprop="interactionCount"]').attr(
    "content",
  );
  const downloadCount = extractDownloadCount(interactionCount);

  const subjects = $('h4 a span[itemprop="genre"]')
    .map((_i, el) => normalizeWhitespace($(el).text()))
    .get()
    .filter(Boolean);

  const offers: EpubBooksOffer[] = [];
  $('li[itemprop="offers"][itemscope]').each((_i, el) => {
    const dlidRaw = $(el).find("[data-dlid]").attr("data-dlid")?.trim();
    const dlid = dlidRaw ? Number.parseInt(dlidRaw, 10) : NaN;
    if (!Number.isFinite(dlid)) return;

    const h4 = $(el).find("h4").first();
    const sizeLabel =
      normalizeWhitespace(h4.find("span").first().text() || "") || null;

    // Extract label without the size badge.
    const h4Clone = h4.clone();
    h4Clone.find("span").remove();
    const label = parseOfferLabel(h4Clone.text());
    offers.push({
      label,
      dlid,
      fileSizeLabel: sizeLabel,
      fileSizeBytes: parseHumanFileSizeBytes(sizeLabel),
    });
  });

  return {
    externalSlug,
    url,
    title,
    author,
    description,
    year,
    coverUrl,
    pageCount,
    language,
    publisher,
    subjects,
    downloadCount,
    offers,
  };
};

export const parseEpubBooksCatalogPageHtml = (html: string): string[] => {
  const $ = cheerio.load(html || "");
  const set = new Set<string>();

  $('a[href^="/book/"]').each((_i, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/^\/book\/([0-9]+-[^?#/]+)$/);
    if (!match) return;
    set.add(match[1]);
  });

  return Array.from(set);
};

export const fetchEpubBooksHtml = async (url: string): Promise<string> => {
  const response = await axios.get<string>(url, {
    timeout: 20_000,
    headers: DEFAULT_HEADERS,
    responseType: "text",
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return typeof response.data === "string"
    ? response.data
    : String(response.data);
};

export const fetchEpubBooksCatalogPage = async (
  page: number,
  sort: "title" | "released" = "title",
) => {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const url = new URL("/books", EPUBBOOKS_BASE_URL);
  if (safePage > 1) url.searchParams.set("page", String(safePage));
  if (sort === "title") url.searchParams.set("sort", "title");
  return fetchEpubBooksHtml(url.toString());
};

export const fetchEpubBooksBookDetail = async (
  externalSlug: string,
): Promise<EpubBooksBookDetail> => {
  const url = buildEpubBooksBookUrl(externalSlug);
  const html = await fetchEpubBooksHtml(url);
  return parseEpubBooksBookDetailHtml(externalSlug, html);
};

type ResolvedDownload = {
  tokenId: string;
  cookieHeader: string;
};

export const resolveEpubBooksDownloadToken = async (
  dlid: number,
): Promise<ResolvedDownload> => {
  if (!Number.isFinite(dlid) || dlid <= 0) {
    throw new Error(`Invalid epubBooks download id: ${dlid}`);
  }

  const response = await axios.post(
    `${EPUBBOOKS_BASE_URL}/downloads`,
    { id: dlid },
    {
      timeout: 20_000,
      headers: {
        ...DEFAULT_HEADERS,
        "content-type": "application/json",
        accept: "application/json, text/plain, */*",
        origin: EPUBBOOKS_BASE_URL,
        referer: EPUBBOOKS_BASE_URL,
      },
      responseType: "text",
      validateStatus: (status) => status >= 200 && status < 400,
    },
  );

  const payloadRaw =
    typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);
  let tokenId: string | null = null;
  try {
    const parsed = JSON.parse(payloadRaw) as { id?: unknown };
    tokenId = typeof parsed.id === "string" ? parsed.id : null;
  } catch {
    tokenId = null;
  }
  if (!tokenId) {
    throw new Error("epubBooks download token response is invalid");
  }

  const setCookies = (response.headers["set-cookie"] || []) as string[];
  const downloadCookie = setCookies.find((entry) =>
    entry.toLowerCase().startsWith("download="),
  );
  if (!downloadCookie) {
    throw new Error("epubBooks did not set download cookie");
  }

  const cookieValue = downloadCookie.split(";")[0] || "";
  if (!cookieValue) {
    throw new Error("epubBooks download cookie header is empty");
  }

  return {
    tokenId,
    cookieHeader: cookieValue,
  };
};

export const fetchEpubBooksFileStream = async (dlid: number) => {
  const resolved = await resolveEpubBooksDownloadToken(dlid);
  const url = `${EPUBBOOKS_BASE_URL}/downloads/${encodeURIComponent(resolved.tokenId)}/file`;

  const response = await axios.get(url, {
    timeout: 60_000,
    responseType: "stream",
    headers: {
      ...DEFAULT_HEADERS,
      cookie: resolved.cookieHeader,
      referer: EPUBBOOKS_BASE_URL,
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });

  return {
    stream: response.data as unknown as NodeJS.ReadableStream,
    headers: response.headers as Record<string, string | string[] | undefined>,
    url,
  };
};

export const pickEpubBooksOffer = (
  offers: EpubBooksOffer[],
  requested: EpubBooksRequestedFormat,
): EpubBooksOffer | null => {
  if (!offers.length) return null;
  const normalized = requested.toLowerCase();

  const epub = offers.find((offer) => /\bepub\b/i.test(offer.label));
  const kindle = offers.find((offer) => /\bkindle\b/i.test(offer.label));
  if (normalized === "kindle") return kindle || epub || offers[0] || null;
  return epub || kindle || offers[0] || null;
};
