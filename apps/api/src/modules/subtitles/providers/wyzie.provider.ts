import type {
  SubtitleProvider,
  SubtitleQuery,
  SubtitleTrack,
} from "../subtitle-provider";

const API_URL = "https://sub.wyzie.io/search";

type WyzieSubtitle = {
  id?: string;
  url?: string;
  format?: string;
  encoding?: string;
  display?: string;
  language?: string;
  isHearingImpaired?: boolean;
  source?: string | string[];
  release?: string | null;
  fileName?: string | null;
  downloadCount?: number | null;
};

/**
 * Aggregates several scrapers behind a single TMDB/IMDb lookup and hands
 * back directly linkable files, so its tracks need no proxying.
 *
 * `season` and `episode` are all-or-nothing on this API — sending one
 * without the other is rejected — so an episode without a season is treated
 * as a whole-series query rather than an error.
 */
export class WyzieProvider implements SubtitleProvider {
  readonly name = "wyzie";

  private readonly apiKey = process.env.WYZIE_API_KEY || "";

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  supports(query: SubtitleQuery): boolean {
    return Boolean(query.tmdbId || query.imdbId);
  }

  async search(query: SubtitleQuery): Promise<SubtitleTrack[]> {
    const params = new URLSearchParams({
      id: query.tmdbId ? String(query.tmdbId) : String(query.imdbId),
      language: query.languages.join(","),
      key: this.apiKey,
    });

    if (query.season != null && query.episode != null) {
      params.set("season", String(query.season));
      params.set("episode", String(query.episode));
    }

    const response = await fetch(`${API_URL}?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];

    const json = (await response.json()) as WyzieSubtitle[];
    if (!Array.isArray(json)) return [];

    const tracks: SubtitleTrack[] = [];
    for (const entry of json) {
      if (!entry.url) continue;
      const language = entry.language || "";
      tracks.push({
        id: entry.id || entry.url,
        provider: this.name,
        language,
        label: entry.display || entry.fileName || language || "Subtitles",
        url: entry.url,
        format: entry.format || "srt",
        hearingImpaired: entry.isHearingImpaired === true,
        rank: entry.downloadCount ?? 0,
        release: entry.release ?? null,
      });
    }
    return tracks;
  }
}
