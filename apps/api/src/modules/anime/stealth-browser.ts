// apps/api/src/modules/anime/stealth-browser.ts
// Stealth browser for bypassing bot detection on anime sites

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

let browserInstance: Browser | null = null;
let browserInitPromise: Promise<Browser> | null = null;

// Stealth user agents - rotate to avoid fingerprinting
const STEALTH_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];

const getRandomUserAgent = () =>
  STEALTH_USER_AGENTS[Math.floor(Math.random() * STEALTH_USER_AGENTS.length)];

async function getStealthBrowser(): Promise<Browser> {
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
      "--disable-blink-features=AutomationControlled",
      "--window-size=1920,1080",
      "--start-maximized",
    ],
  });

  browserInstance = await browserInitPromise;
  browserInitPromise = null;
  return browserInstance;
}

// Apply stealth techniques to page
async function applyStealth(page: Page): Promise<void> {
  // Override navigator.webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    // Override plugins
    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
        {
          name: "Chrome PDF Viewer",
          filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
        },
        { name: "Native Client", filename: "internal-nacl-plugin" },
      ],
    });

    // Override languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // Override permission
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (
        parameters: PermissionDescriptor,
      ) =>
        parameters.name === "notifications"
          ? Promise.resolve({
              state: Notification.permission,
            } as unknown as PermissionStatus)
          : originalQuery(parameters);
    }

    // Override chrome
    (window as unknown as { chrome: unknown }).chrome = {
      runtime: {},
      loadTimes: () => ({}),
      csi: () => ({}),
      app: {},
    };

    // Override notification
    if (!window.Notification) {
      (window as unknown as { Notification: unknown }).Notification = {
        permission: "default",
      };
    }

    // Add iframe contentWindow chrome
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options: ShadowRootInit) {
      const shadow = originalAttachShadow.call(this, options);
      Object.defineProperty(shadow, "chrome", {
        get: () => ({ runtime: {} }),
      });
      return shadow;
    };
  });

  // Set viewport and user agent
  await page.setViewportSize({ width: 1920, height: 1080 });
}

export type ScrapedSource = {
  url: string;
  quality: string;
  isM3U8: boolean;
  referer?: string;
};

export async function scrapeWithStealth(
  targetUrl: string,
  options: {
    waitForVideo?: boolean;
    timeout?: number;
    scrollPage?: boolean;
  } = {},
): Promise<{ sources: ScrapedSource[]; title?: string; episode?: number }> {
  const { waitForVideo = true, timeout = 60000, scrollPage = true } = options;

  const browser = await getStealthBrowser();
  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });

  const page = await context.newPage();
  const sources: ScrapedSource[] = [];
  const seenUrls = new Set<string>();

  try {
    // Intercept network requests
    await page.route("**/*", (route) => {
      const url = route.request().url();

      // Capture video URLs
      if (url.match(/\.(m3u8|mp4)(?:\?|$)/i) && !seenUrls.has(url)) {
        seenUrls.add(url);

        const quality = extractQuality(url);
        sources.push({
          url,
          quality,
          isM3U8: url.includes(".m3u8"),
          referer: targetUrl,
        });
      }

      route.continue();
    });

    // Apply stealth
    await applyStealth(page);

    // Navigate with timeout
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    // Wait for page to settle
    await page.waitForTimeout(3000);

    // Try to click play button if exists
    const playSelectors = [
      ".play-button",
      "[data-play]",
      ".vjs-play-control",
      ".plyr__control--overlaid",
      'button[aria-label*="play" i]',
      ".jw-icon-playback",
    ];

    for (const selector of playSelectors) {
      try {
        const playBtn = await page.$(selector);
        if (playBtn) {
          await playBtn.click();
          await page.waitForTimeout(2000);
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    // Wait for video if requested
    if (waitForVideo) {
      try {
        await page.waitForSelector("video", { timeout: 10000 });

        // Try to play video
        await page.evaluate(() => {
          const video = document.querySelector("video");
          if (video && video.paused) {
            video.play().catch(() => {});
          }
        });

        // Wait for network requests
        await page.waitForTimeout(5000);
      } catch {
        // Video element not found, continue
      }
    }

    // Scroll page to trigger lazy loading
    if (scrollPage) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await page.waitForTimeout(2000);
    }

    // Extract page info
    const pageInfo = await page.evaluate(() => {
      const title =
        document.querySelector("h1")?.textContent?.trim() ||
        document.querySelector(".film-name")?.textContent?.trim() ||
        document.title;

      const epMatch =
        document.title.match(/Episode\s+(\d+)/i) ||
        document.body.textContent?.match(/Episode\s+(\d+)/i);

      return {
        title,
        episode: epMatch ? parseInt(epMatch[1], 10) : undefined,
      };
    });

    return {
      sources: sources.slice(0, 20), // Limit to 20 sources
      title: pageInfo.title,
      episode: pageInfo.episode,
    };
  } catch (error) {
    console.error("[StealthBrowser] Scraping failed:", error);
    return { sources: [] };
  } finally {
    await context.close();
  }
}

function extractQuality(url: string): string {
  const patterns = [
    /(\d{3,4}p)/i,
    /_([\d]+)_/,
    /quality[=_-]([^&/]+)/i,
    /([\d]+)k/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "auto";
}

export async function closeStealthBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
