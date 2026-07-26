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

/**
 * Orders by the caller's language preference first, then by provider rank.
 * A track in a language the caller didn't ask for sorts after every one they
 * did, rather than being dropped — a Japanese track is still worth offering
 * when it is the only thing that exists for an episode.
 */
function rankTracks(
  tracks: SubtitleTrack[],
  languages: string[],
): SubtitleTrack[] {
  const preference = new Map(
    languages.map((lang, index) => [lang.toLowerCase(), index]),
  );
  return [...tracks].sort((a, b) => {
    const aLang =
      preference.get(a.language.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const bLang =
      preference.get(b.language.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    if (aLang !== bLang) return aLang - bLang;
    return b.rank - a.rank;
  });
}

export type SubtitleResolution = {
  tracks: SubtitleTrack[];
  /** Providers actually queried, for debugging a thin result. */
  providersQueried: string[];
  providersSkipped: string[];
};

export async function resolveSubtitles(
  providers: SubtitleProvider[],
  query: SubtitleQuery,
): Promise<SubtitleResolution> {
  const languages = query.languages.length
    ? query.languages
    : DEFAULT_SUBTITLE_LANGUAGES;
  const normalised: SubtitleQuery = { ...query, languages };

  const usable: SubtitleProvider[] = [];
  const skipped: string[] = [];
  for (const provider of providers) {
    if (provider.isConfigured() && provider.supports(normalised)) {
      usable.push(provider);
    } else {
      skipped.push(provider.name);
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
    tracks: rankTracks(tracks, languages).slice(0, SUBTITLE_RESULT_LIMIT),
    providersQueried: usable.map((p) => p.name),
    providersSkipped: skipped,
  };
}
