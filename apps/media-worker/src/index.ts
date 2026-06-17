export interface Env {
  MEDIA_BUCKET: R2Bucket;
}

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,HEAD,OPTIONS",
  "access-control-allow-headers":
    "Range, Origin, Content-Type, Accept, User-Agent",
  "access-control-expose-headers":
    "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified",
};

type ParsedRange = { offset: number; length?: number } | { suffix: number };

const parseRangeHeader = (value: string | null): ParsedRange | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed);
  if (!match) return null;

  const startRaw = match[1] || "";
  const endRaw = match[2] || "";

  if (!startRaw && !endRaw) return null;

  // Suffix range: bytes=-500
  if (!startRaw && endRaw) {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { suffix };
  }

  const offset = Number(startRaw);
  if (!Number.isFinite(offset) || offset < 0) return null;

  // Open-ended range: bytes=500-
  if (!endRaw) {
    return { offset };
  }

  // Bounded range: bytes=500-999
  const end = Number(endRaw);
  if (!Number.isFinite(end) || end < offset) return null;
  return { offset, length: end - offset + 1 };
};

const inferContentType = (key: string): string | null => {
  const lower = (key || "").toLowerCase();
  if (lower.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (lower.endsWith(".ts")) return "video/mp2t";
  if (lower.endsWith(".m4s")) return "video/iso.segment";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".vtt")) return "text/vtt; charset=utf-8";
  if (lower.endsWith(".srt")) return "application/x-subrip";
  return null;
};

const cacheControlForKey = (key: string): string => {
  const lower = (key || "").toLowerCase();
  // HLS manifests change more frequently than segments.
  if (lower.endsWith(".m3u8")) return "public, max-age=30, s-maxage=30";
  // Segments and mp4s are immutable per key.
  if (
    lower.endsWith(".ts") ||
    lower.endsWith(".m4s") ||
    lower.endsWith(".mp4")
  ) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          ...CORS_HEADERS,
          allow: "GET, HEAD, OPTIONS",
        },
      });
    }

    const key = url.pathname.replace(/^\/+/, "");
    if (!key) {
      return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
    }

    const rangeHeader = request.headers.get("range");
    const parsedRange = parseRangeHeader(rangeHeader);

    const object = await env.MEDIA_BUCKET.get(
      key,
      parsedRange ? { range: parsedRange } : undefined,
    );
    if (object === null) {
      return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
    }

    // If a precondition fails, get() may return metadata without a body.
    if (!("body" in object) || !object.body) {
      return new Response("Not Modified", {
        status: 304,
        headers: CORS_HEADERS,
      });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", cacheControlForKey(key));
    headers.set("x-content-type-options", "nosniff");
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      headers.set(k, v);
    }

    if (!headers.get("content-type")) {
      const inferred = inferContentType(key);
      if (inferred) headers.set("content-type", inferred);
    }

    // Range response headers.
    if (
      parsedRange &&
      object.range &&
      typeof object.range.offset === "number" &&
      typeof object.range.length === "number"
    ) {
      const start = object.range.offset;
      const end = start + object.range.length - 1;
      headers.set("content-range", `bytes ${start}-${end}/${object.size}`);
      headers.set("content-length", String(object.range.length));
      return new Response(request.method === "HEAD" ? null : object.body, {
        status: 206,
        headers,
      });
    }

    return new Response(request.method === "HEAD" ? null : object.body, {
      status: 200,
      headers,
    });
  },
};
