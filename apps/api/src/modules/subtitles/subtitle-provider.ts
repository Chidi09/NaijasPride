/**
 * A provider-based subtitle search.
 *
 * No single subtitle source covers this catalogue. OpenSubtitles is the
 * largest but is keyed on IMDb/TMDB ids and is weakest on fresh seasonal
 * anime; Jimaku is keyed on AniList ids so it matches anime exactly, but
 * hosts Japanese tracks; Wyzie aggregates several scrapers behind one TMDB
 * lookup. Which of them can answer at all depends on what identifiers the
 * caller has, so they are modelled as interchangeable providers that each
 * declare what they support, and the resolver asks every provider that can
 * answer and merges the results.
 *
 * Every provider is optional. One without its API key configured reports
 * itself unconfigured and is skipped, so the feature degrades to whichever
 * keys are actually present rather than failing outright.
 */

export type SubtitleQuery = {
  imdbId?: string | null;
  tmdbId?: number | null;
  anilistId?: number | null;
  season?: number | null;
  episode?: number | null;
  title?: string | null;
  year?: number | null;
  /** ISO-639-1 codes, most preferred first. */
  languages: string[];
  /**
   * Return tracks in languages that were not asked for, ranked after the ones
   * that were. Off by default: a viewer who asked for English and is handed a
   * Japanese track has been given noise, not a fallback.
   */
  anyLanguage?: boolean;
};

export type SubtitleTrack = {
  /** Unique within a provider. */
  id: string;
  provider: string;
  /** ISO-639-1 where the provider gives one. */
  language: string;
  label: string;
  /**
   * Either a direct file URL or an API-relative path this server proxies.
   * OpenSubtitles needs a second authenticated call to turn a file id into a
   * link, so its tracks point back here rather than at the provider.
   */
  url: string;
  format: string;
  hearingImpaired: boolean;
  /** Higher sorts first within a language. Download count where known. */
  rank: number;
  release?: string | null;
};

export interface SubtitleProvider {
  readonly name: string;
  /** False when the provider's API key is absent. */
  isConfigured(): boolean;
  /** False when the query lacks the identifiers this provider needs. */
  supports(query: SubtitleQuery): boolean;
  /**
   * The languages this provider can actually serve, where that is a fixed and
   * narrow set. A provider that carries everything leaves this undefined and
   * is queried for any language.
   *
   * This exists so a single-language catalogue is not queried for a language
   * it will never have. Without it, Jimaku answered every anime request —
   * it is the only provider that accepts an AniList id — and the response was
   * Japanese regardless of what was asked for.
   */
  readonly languages?: readonly string[];
  search(query: SubtitleQuery): Promise<SubtitleTrack[]>;
}

/**
 * Per-provider budget. A slow provider must not hold up the ones that have
 * already answered — the caller is a video player waiting to start.
 */
export const SUBTITLE_PROVIDER_TIMEOUT_MS = 8000;

/** Cap on what is handed back, after ranking. */
export const SUBTITLE_RESULT_LIMIT = 30;

export const DEFAULT_SUBTITLE_LANGUAGES = ["en"];

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/** Normalises `en-US`, `EN`, `eng` and friends to a comparable base code. */
function baseLanguage(code: string): string {
  const lower = code.trim().toLowerCase();
  const base = lower.split(/[-_]/)[0];
  // The three-letter forms the providers mix in for the languages this
  // catalogue actually asks for.
  const alias: Record<string, string> = {
    eng: "en",
    jpn: "ja",
    fra: "fr",
    fre: "fr",
    spa: "es",
    por: "pt",
    ara: "ar",
    deu: "de",
    ger: "de",
  };
  return alias[base] || base;
}

/**
 * Orders by the caller's language preference first, then by provider rank,
 * and drops languages that were not asked for unless the caller opted in.
 *
 * The earlier version kept every language and merely sorted the unasked-for
 * ones last, on the theory that a Japanese track beats no track. In practice
 * that is what a viewer saw: for anime the only provider able to answer an
 * AniList id serves Japanese, so "sorted last" and "the entire list" were the
 * same thing, and the player's subtitle menu offered nothing else.
 */
function selectTracks(
  tracks: SubtitleTrack[],
  languages: string[],
  anyLanguage: boolean,
): SubtitleTrack[] {
  const preference = new Map(
    languages.map((lang, index) => [baseLanguage(lang), index]),
  );
  const kept = anyLanguage
    ? [...tracks]
    : tracks.filter((track) => preference.has(baseLanguage(track.language)));
  return kept.sort((a, b) => {
    const aLang =
      preference.get(baseLanguage(a.language)) ?? Number.MAX_SAFE_INTEGER;
    const bLang =
      preference.get(baseLanguage(b.language)) ?? Number.MAX_SAFE_INTEGER;
    if (aLang !== bLang) return aLang - bLang;
    return b.rank - a.rank;
  });
}

export type SkipReason = "unconfigured" | "unsupported-query" | "language";

export type SkippedProvider = { provider: string; reason: SkipReason };

export type SubtitleResolution = {
  tracks: SubtitleTrack[];
  /** Providers actually queried, for debugging a thin result. */
  providersQueried: string[];
  /**
   * Providers left out and why. Worth returning rather than logging: an
   * unset API key is invisible from the outside and otherwise looks exactly
   * like a provider that had no match.
   */
  providersSkipped: SkippedProvider[];
};

/** Whether a provider's fixed catalogue can serve any requested language. */
function servesRequestedLanguage(
  provider: SubtitleProvider,
  languages: string[],
  anyLanguage: boolean,
): boolean {
  if (anyLanguage || !provider.languages?.length) return true;
  const wanted = new Set(languages.map(baseLanguage));
  return provider.languages.some((lang) => wanted.has(baseLanguage(lang)));
}

export async function resolveSubtitles(
  providers: SubtitleProvider[],
  query: SubtitleQuery,
): Promise<SubtitleResolution> {
  const languages = query.languages.length
    ? query.languages
    : DEFAULT_SUBTITLE_LANGUAGES;
  const anyLanguage = query.anyLanguage === true;
  const normalised: SubtitleQuery = { ...query, languages, anyLanguage };

  const usable: SubtitleProvider[] = [];
  const skipped: SkippedProvider[] = [];
  for (const provider of providers) {
    if (!provider.isConfigured()) {
      skipped.push({ provider: provider.name, reason: "unconfigured" });
    } else if (!provider.supports(normalised)) {
      skipped.push({ provider: provider.name, reason: "unsupported-query" });
    } else if (!servesRequestedLanguage(provider, languages, anyLanguage)) {
      skipped.push({ provider: provider.name, reason: "language" });
    } else {
      usable.push(provider);
    }
  }

  const settled = await Promise.all(
    usable.map((provider) =>
      withTimeout(provider.search(normalised), SUBTITLE_PROVIDER_TIMEOUT_MS),
    ),
  );

  const seen = new Set<string>();
  const tracks: SubtitleTrack[] = [];
  for (const result of settled) {
    for (const track of result || []) {
      const key = `${track.provider}:${track.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push(track);
    }
  }

  return {
    tracks: selectTracks(tracks, languages, anyLanguage).slice(
      0,
      SUBTITLE_RESULT_LIMIT,
    ),
    providersQueried: usable.map((p) => p.name),
    providersSkipped: skipped,
  };
}
