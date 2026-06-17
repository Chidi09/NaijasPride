type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    mobile?: boolean;
    platform?: string;
  };
};

const TV_QUERY_PARAM = "tv";
const TV_STORAGE_KEY = "np-force-tv";

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);

function readTvOverride(): boolean | null {
  if (typeof window === "undefined") return null;

  const queryValue = new URLSearchParams(window.location.search)
    .get(TV_QUERY_PARAM)
    ?.trim()
    .toLowerCase();
  if (queryValue) {
    if (TRUTHY.has(queryValue)) {
      window.localStorage.setItem(TV_STORAGE_KEY, "1");
      return true;
    }
    if (FALSY.has(queryValue)) {
      window.localStorage.setItem(TV_STORAGE_KEY, "0");
      return false;
    }
  }

  const storedValue = window.localStorage
    .getItem(TV_STORAGE_KEY)
    ?.trim()
    .toLowerCase();
  if (!storedValue) return null;
  if (TRUTHY.has(storedValue)) return true;
  if (FALSY.has(storedValue)) return false;

  return null;
}

export function detectTvEnvironment(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return false;

  const override = readTvOverride();
  if (override !== null) return override;

  const nav = navigator as NavigatorWithUAData;
  const ua = nav.userAgent.toLowerCase();
  const platform = nav.userAgentData?.platform?.toLowerCase() || "";

  const tvSignatures = [
    "smart-tv",
    "smarttv",
    "googletv",
    "google tv",
    "android tv",
    "hbbtv",
    "webos",
    "tizen",
    "netcast",
    "netcast.tv",
    "viera",
    "bravia",
    "philipstv",
    "panasonictv",
    "appletv",
    "afts",
    "aftmm",
    "aftka",
    "aftt",
    "roku",
    "roku/dvp",
    "pov_tv",
    "ce-html",
  ];

  if (
    tvSignatures.some(
      (signature) => ua.includes(signature) || platform.includes(signature),
    )
  ) {
    return true;
  }

  const isMobileUa = /android|iphone|ipad|ipod|mobile/.test(ua);
  const isDesktopUa =
    /windows nt|macintosh|x11|linux/.test(ua) && !ua.includes("android");
  const screenWidth = Math.max(
    window.innerWidth || 0,
    window.screen?.width || 0,
  );
  const screenHeight = Math.max(
    window.innerHeight || 0,
    window.screen?.height || 0,
  );
  const maxSide = Math.max(screenWidth, screenHeight);
  const minSide = Math.min(screenWidth, screenHeight);
  const coarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const anyHover = window.matchMedia?.("(any-hover: hover)").matches ?? false;

  return (
    maxSide >= 1280 &&
    minSide >= 720 &&
    coarsePointer &&
    !anyHover &&
    !isMobileUa &&
    !isDesktopUa
  );
}
