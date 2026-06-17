// apps/api/src/modules/anime/gogoanime-by-provider.ts
// GoGoAnime.by provider — scrapes episode pages via FlareSolverr
// and extracts embeddable video sources (kiwi HLS, hianime HD, Blogger 360p).

import type {
  ProviderSource,
  ProviderSubtitles,
} from "./anime-provider-manager";

const GOGOANIME_BASE = "https://gogoanime.by";
const FLARESOLVERR_URL =
  process.env.FLARESOLVERR_URL || "http://flaresolverr:8191/v1";
const FLARESOLVERR_TIMEOUT = 60_000;

// ── Types ────────────────────────────────────────────────────────────────────

type GoGoServerButton = {
  type: string; // 'Blogger' | 'hianime' | 'kiwi'
  label: string; // 'Fast Server' | 'HD-1' | etc.
  encryptedUrl1: string;
  encryptedUrl2: string;
  encryptedUrl3: string;
  plainUrl: string; // only for kiwi
  ref: string;
  subtitle: string;
  key: string;
};

type GoGoEpisodeData = {
  sub: GoGoServerButton[];
  dub: GoGoServerButton[];
  postId: string;
  featureImage: string;
};

// ── FlareSolverr request ────────────────────────────────────────────────────

async function fetchWithFlareSolverr(url: string): Promise<string | null> {
  try {
    const res = await fetch(FLARESOLVERR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "request.get",
        url,
        maxTimeout: FLARESOLVERR_TIMEOUT,
      }),
      signal: AbortSignal.timeout(FLARESOLVERR_TIMEOUT + 10_000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      solution?: { response?: string; status?: number };
    };
    return data.solution?.response || null;
  } catch (error) {
    console.error("[GoGoAnime.by] FlareSolverr error:", error);
    return null;
  }
}

// ── HTML parsing ────────────────────────────────────────────────────────────

function parseEpisodePage(html: string): GoGoEpisodeData | null {
  const data: GoGoEpisodeData = {
    sub: [],
    dub: [],
    postId: "",
    featureImage: "",
  };

  // Extract postId and featureImage from JS defaults
  const postIdMatch = html.match(/defaultPostId\s*=\s*["'](\d+)["']/);
  if (postIdMatch) data.postId = postIdMatch[1]!;

  const featureMatch = html.match(/defaultFeatureImage\s*=\s*["']([^"']+)["']/);
  if (featureMatch) data.featureImage = featureMatch[1]!;

  // Find sub and dub sections
  // Structure: <div data-type="sub">...<ul>...<li buttons>...</ul>...</div>
  //            <div data-type="dub">...<ul>...<li buttons>...</ul>...</div>
  const sectionRegex =
    /data-type=["'](sub|dub)["'][^>]*>[\s\S]*?<ul>([\s\S]*?)<\/ul>/gi;
  let sectionMatch: RegExpExecArray | null;

  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const audioType = sectionMatch[1]!.toLowerCase() as "sub" | "dub";
    const buttonsHtml = sectionMatch[2]!;
    const buttons = parseServerButtons(buttonsHtml);
    if (audioType === "sub") {
      data.sub.push(...buttons);
    } else {
      data.dub.push(...buttons);
    }
  }

  // If section parsing found nothing, try parsing all buttons
  if (data.sub.length === 0 && data.dub.length === 0) {
    const allButtons = parseServerButtons(html);
    // Assume they're sub if no section markers found
    data.sub = allButtons;
  }

  if (data.sub.length === 0 && data.dub.length === 0) {
    return null;
  }

  return data;
}

function parseServerButtons(html: string): GoGoServerButton[] {
  const buttons: GoGoServerButton[] = [];
  const buttonRegex =
    /<li[^>]*class="[^"]*player-type-link[^"]*"([^>]*)>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;

  while ((match = buttonRegex.exec(html)) !== null) {
    const attrs = match[1]!;
    const label = match[2]!.trim();

    const type = extractAttr(attrs, "data-type") || "";
    const enc1 = extractAttr(attrs, "data-encrypted-url1") || "";
    const enc2 = extractAttr(attrs, "data-encrypted-url2") || "";
    const enc3 = extractAttr(attrs, "data-encrypted-url3") || "";
    const plainUrl = extractAttr(attrs, "data-plain-url") || "";
    const ref = extractAttr(attrs, "data-ref") || "gogoanime.by";
    const subtitle = extractAttr(attrs, "data-subtitle") || "";
    const key = extractAttr(attrs, "data-key") || "";

    if (type && (enc1 || plainUrl)) {
      buttons.push({
        type,
        label,
        encryptedUrl1: enc1,
        encryptedUrl2: enc2,
        encryptedUrl3: enc3,
        plainUrl,
        ref,
        subtitle,
        key,
      });
    }
  }

  return buttons;
}

function extractAttr(attrString: string, name: string): string | undefined {
  const regex = new RegExp(`${name}=["']([^"']*)["']`);
  const m = attrString.match(regex);
  return m ? m[1] : undefined;
}

// ── Source building ─────────────────────────────────────────────────────────

function buildSourcesFromButtons(
  buttons: GoGoServerButton[],
  postId: string,
  featureImage: string,
  audioLabel: string,
): ProviderSource[] {
  const sources: ProviderSource[] = [];

  // 1. Kiwi sources (embeddable HLS via mewcdn player) — best quality
  const kiwiButtons = buttons.filter((b) => b.type === "kiwi" && b.plainUrl);
  for (let i = 0; i < kiwiButtons.length; i++) {
    const btn = kiwiButtons[i]!;
    sources.push({
      url: btn.plainUrl,
      quality: `Kiwi ${i + 1}${audioLabel}`,
      isM3U8: false,
      isEmbed: true,
    });
  }

  // 2. HiAnime sources (HD via 9animetv.be) — HD quality
  const hianimeButtons = buttons.filter(
    (b) => b.type === "hianime" && b.encryptedUrl1,
  );
  for (let i = 0; i < hianimeButtons.length; i++) {
    const btn = hianimeButtons[i]!;
    const params = new URLSearchParams({
      hianime: btn.encryptedUrl1,
      url2: btn.encryptedUrl2,
      url3: btn.encryptedUrl3,
      feature_image: featureImage,
      user_agent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      ref: btn.ref,
      postId,
    });
    if (btn.subtitle) params.set("subtitle", btn.subtitle);
    if (btn.key) params.set("key", btn.key);

    const iframeUrl = `https://9animetv.be/wp-content/plugins/video-player/includes/player/player.php?${params.toString()}`;
    sources.push({
      url: iframeUrl,
      quality: `${btn.label || `HD-${i + 1}`}${audioLabel}`,
      isM3U8: false,
      isEmbed: true,
    });
  }

  // 3. Blogger sources (360p via 9animetv.be) — fallback
  const bloggerButtons = buttons.filter(
    (b) => b.type === "Blogger" && b.encryptedUrl1,
  );
  for (let i = 0; i < bloggerButtons.length; i++) {
    const btn = bloggerButtons[i]!;
    const params = new URLSearchParams({
      Blogger: btn.encryptedUrl1,
      url2: btn.encryptedUrl2,
      url3: btn.encryptedUrl3,
      feature_image: featureImage,
      user_agent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      ref: btn.ref,
      postId,
    });
    if (btn.subtitle) params.set("subtitle", btn.subtitle);
    if (btn.key) params.set("key", btn.key);

    const iframeUrl = `https://9animetv.be/wp-content/plugins/video-player/includes/player/player.php?${params.toString()}`;
    sources.push({
      url: iframeUrl,
      quality: `Fast Server${audioLabel}`,
      isM3U8: false,
      isEmbed: true,
    });
  }

  return sources;
}

// ── Search ──────────────────────────────────────────────────────────────────

type GoGoSearchResult = {
  title: string;
  url: string;
  slug: string;
};

export async function searchGoGoAnimeBy(
  query: string,
): Promise<GoGoSearchResult[]> {
  // GoGoAnime.by uses WordPress, search via /?s=query
  const searchUrl = `${GOGOANIME_BASE}/?s=${encodeURIComponent(query)}`;
  const html = await fetchWithFlareSolverr(searchUrl);
  if (!html) return [];

  const results: GoGoSearchResult[] = [];
  // Parse search result links — typically <a href="/anime-slug/"> or <h2><a href="...">Title</a></h2>
  const linkRegex =
    /href=["'](https?:\/\/gogoanime\.by\/([^"'\/]+)\/)["'][^>]*>([^<]+)/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRegex.exec(html)) !== null) {
    const url = m[1]!;
    const slug = m[2]!;
    const title = m[3]!.trim();
    // Skip non-anime pages
    if (["category", "tag", "page", "author", "wp-content"].includes(slug))
      continue;
    if (!results.some((r) => r.slug === slug)) {
      results.push({ title, url, slug });
    }
  }

  return results;
}

// ── Episode list ────────────────────────────────────────────────────────────

type GoGoEpisodeListItem = {
  number: number;
  url: string;
  title: string;
};

export async function getGoGoAnimeByEpisodes(
  animeSlug: string,
): Promise<GoGoEpisodeListItem[]> {
  // Typically episodes are listed on the anime page or via /{slug}-episode-N-english-subbed/
  // For now, we'll try fetching the anime page and parsing episode links
  const animeUrl = `${GOGOANIME_BASE}/${animeSlug}/`;
  const html = await fetchWithFlareSolverr(animeUrl);
  if (!html) return [];

  const episodes: GoGoEpisodeListItem[] = [];
  // Episode links: /slug-episode-N-english-subbed/ or /slug-episode-N/
  const epRegex = new RegExp(
    `href=["'](https?://gogoanime\\.by/${escapeRegex(animeSlug)}-episode-(\\d+)[^"']*)["']`,
    "gi",
  );
  let m: RegExpExecArray | null;

  while ((m = epRegex.exec(html)) !== null) {
    const epNum = parseInt(m[2]!, 10);
    if (!episodes.some((e) => e.number === epNum)) {
      episodes.push({
        number: epNum,
        url: m[1]!,
        title: `Episode ${epNum}`,
      });
    }
  }

  return episodes.sort((a, b) => a.number - b.number);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Watch sources ───────────────────────────────────────────────────────────

export async function getGoGoAnimeByWatchSources(
  episodeUrl: string,
  audioType: "sub" | "dub" = "sub",
): Promise<{
  sources: ProviderSource[];
  subtitles: ProviderSubtitles[];
}> {
  console.log(
    `[GoGoAnime.by] Fetching sources from ${episodeUrl} (${audioType})`,
  );
  const html = await fetchWithFlareSolverr(episodeUrl);
  if (!html) {
    console.error("[GoGoAnime.by] Failed to fetch episode page");
    return { sources: [], subtitles: [] };
  }

  const episodeData = parseEpisodePage(html);
  if (!episodeData) {
    console.error("[GoGoAnime.by] Failed to parse episode page");
    return { sources: [], subtitles: [] };
  }

  const buttons = audioType === "dub" ? episodeData.dub : episodeData.sub;
  // If requested type not available, fall back to whatever we have
  const effectiveButtons =
    buttons.length > 0
      ? buttons
      : audioType === "dub"
        ? episodeData.sub
        : episodeData.dub;

  const audioLabel = audioType === "dub" ? " (Dub)" : "";
  const sources = buildSourcesFromButtons(
    effectiveButtons,
    episodeData.postId,
    episodeData.featureImage,
    audioLabel,
  );

  console.log(`[GoGoAnime.by] Found ${sources.length} sources (${audioType})`);
  return { sources, subtitles: [] };
}

// ── Convenience: search + get sources for an episode ────────────────────────

export async function resolveGoGoAnimeByEpisode(
  query: string,
  episodeNumber: number,
  audioType: "sub" | "dub" = "sub",
): Promise<{
  sources: ProviderSource[];
  subtitles: ProviderSubtitles[];
  episodeUrl?: string;
}> {
  // Search for the anime
  const results = await searchGoGoAnimeBy(query);
  if (results.length === 0) {
    console.log(`[GoGoAnime.by] No search results for "${query}"`);
    return { sources: [], subtitles: [] };
  }

  // Try the episode URL pattern directly for top results
  for (const result of results.slice(0, 3)) {
    const subSuffix = "-english-subbed";
    const dubSuffix = "-english-dubbed";
    const suffix = audioType === "dub" ? dubSuffix : subSuffix;
    const episodeUrl = `${GOGOANIME_BASE}/${result.slug}-episode-${episodeNumber}${suffix}/`;

    console.log(`[GoGoAnime.by] Trying: ${episodeUrl}`);
    const { sources, subtitles } = await getGoGoAnimeByWatchSources(
      episodeUrl,
      audioType,
    );

    if (sources.length > 0) {
      return { sources, subtitles, episodeUrl };
    }

    // Try without the -english-subbed suffix
    const altUrl = `${GOGOANIME_BASE}/${result.slug}-episode-${episodeNumber}/`;
    console.log(`[GoGoAnime.by] Trying alt: ${altUrl}`);
    const alt = await getGoGoAnimeByWatchSources(altUrl, audioType);
    if (alt.sources.length > 0) {
      return { ...alt, episodeUrl: altUrl };
    }
  }

  return { sources: [], subtitles: [] };
}

// ── Health check ────────────────────────────────────────────────────────────

export async function checkGoGoAnimeByHealth(): Promise<{
  healthy: boolean;
  message: string;
}> {
  try {
    const html = await fetchWithFlareSolverr(GOGOANIME_BASE);
    if (!html)
      return { healthy: false, message: "FlareSolverr request failed" };
    if (html.includes("gogoanime")) {
      return { healthy: true, message: "Reachable via FlareSolverr" };
    }
    return { healthy: false, message: "Unexpected response" };
  } catch {
    return { healthy: false, message: "Health check failed" };
  }
}
