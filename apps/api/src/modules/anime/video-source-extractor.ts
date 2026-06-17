import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

// Extend Window interface for video players
declare global {
  interface Window {
    jwplayer?: () => {
      getPlaylist: () => Array<{
        sources?: Array<{ file?: string; label?: string }>;
      }>;
    };
    videojs?: (id: string) => { src: () => string };
    Hls?: unknown;
    hls?: { url?: string };
  }
}

export type VideoSource = {
  url: string;
  quality: string;
  isM3U8: boolean;
  referer?: string;
};

let browserInstance: Browser | null = null;
let browserInitPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance) return browserInstance;
  if (browserInitPromise) return browserInitPromise;

  browserInitPromise = chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  browserInstance = await browserInitPromise;
  browserInitPromise = null;
  return browserInstance;
}

export async function extractVideoSources(
  embedUrl: string,
): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
    });

    page = await context.newPage();

    // Intercept network requests to capture m3u8 and mp4 URLs
    await page.route("**/*", (route) => {
      const url = route.request().url();

      // Capture m3u8 master playlists
      if (url.includes(".m3u8") && !url.includes("tracker")) {
        const quality = extractQualityFromUrl(url);
        sources.push({
          url,
          quality: quality || "auto",
          isM3U8: true,
          referer: embedUrl,
        });
      }

      // Capture direct mp4 files
      if (url.includes(".mp4") && !url.includes("thumbnail")) {
        const quality = extractQualityFromUrl(url);
        sources.push({
          url,
          quality: quality || "auto",
          isM3U8: false,
          referer: embedUrl,
        });
      }

      route.continue();
    });

    // Navigate to embed page
    await page.goto(embedUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Wait for video element to appear
    await page.waitForSelector("video", { timeout: 15000 }).catch(() => {});

    // Try to trigger video playback
    await page.evaluate(() => {
      const video = document.querySelector("video");
      if (video) {
        video.play().catch(() => {});
      }

      // Try to click play button if exists
      const playButton = document.querySelector(
        ".play-button, [data-play], .vjs-play-control, .plyr__control--overlaid",
      );
      if (playButton instanceof HTMLElement) {
        playButton.click();
      }
    });

    // Wait a bit for network requests to fire
    await page.waitForTimeout(5000);

    // Try to extract sources from page scripts
    const pageSources = await page.evaluate(() => {
      const found: Array<{ url: string; quality?: string }> = [];

      // Look for sources in common player configurations
      if (window.jwplayer) {
        const jw = window.jwplayer();
        if (jw && jw.getPlaylist) {
          const playlist = jw.getPlaylist();
          playlist.forEach(
            (item: {
              sources?: Array<{
                file?: string;
                label?: string;
                default?: boolean;
              }>;
            }) => {
              if (item.sources) {
                item.sources.forEach(
                  (src: {
                    file?: string;
                    label?: string;
                    default?: boolean;
                  }) => {
                    if (src.file)
                      found.push({ url: src.file, quality: src.label });
                  },
                );
              }
            },
          );
        }
      }

      // Look for Plyr config
      const plyrData = document.querySelector("[data-plyr-embed-id]");
      if (plyrData) {
        const sources = plyrData.querySelectorAll("source");
        sources.forEach((src) => {
          if (src.src)
            found.push({
              url: src.src,
              quality: src.getAttribute("size") || undefined,
            });
        });
      }

      // Look for Video.js
      if ((window as unknown as { videojs?: unknown }).videojs) {
        const players = document.querySelectorAll(".video-js");
        players.forEach((player) => {
          const id = player.getAttribute("id");
          if (id) {
            const vjsPlayer = (
              window as unknown as {
                videojs: (id: string) => {
                  currentSources: () => Array<{ src: string; type?: string }>;
                  src: () => string;
                };
              }
            ).videojs(id);
            if (vjsPlayer && vjsPlayer.src) {
              found.push({ url: vjsPlayer.src() });
            }
          }
        });
      }

      // Look for hls.js
      if (
        (window as unknown as { Hls?: unknown }).Hls &&
        (window as unknown as { hls?: unknown }).hls
      ) {
        const hls = (window as unknown as { hls: { url: string } }).hls;
        if (hls.url) {
          found.push({ url: hls.url });
        }
      }

      return found;
    });

    for (const src of pageSources) {
      if (!sources.some((s) => s.url === src.url)) {
        sources.push({
          url: src.url,
          quality: src.quality || extractQualityFromUrl(src.url) || "auto",
          isM3U8: src.url.includes(".m3u8"),
          referer: embedUrl,
        });
      }
    }
  } catch (error) {
    console.error("Error extracting video sources:", error);
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }

  return sources;
}

function extractQualityFromUrl(url: string): string | null {
  // Try to extract quality from URL patterns
  const patterns = [
    /(\d{3,4}p)/i,
    /_([\d]+)_/,
    /quality[=_-]([^&/]+)/i,
    /([\d]+)k/i,
    /hd/i,
    /sd/i,
    /fhd/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }

  return null;
}

export async function closeVideoExtractor(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
