import type {
  SubtitleProvider,
  SubtitleQuery,
  SubtitleTrack,
} from "../subtitle-provider";

const API_URL = "https://api.opensubtitles.com/api/v1";

type OpenSubtitlesSubtitle = {
  id?: string;
  attributes?: {
    language?: string;
    hearing_impaired?: boolean;
    download_count?: number;
    release?: string;
    files?: Array<{ file_id?: number; file_name?: string }>;
  };
};

/**
 * The largest general catalogue. Keyed by IMDb or TMDB id, with season and
 * episode numbers for series.
 *
 * Its files are not directly linkable: a search returns a `file_id`, and
 * turning that into a URL needs a second authenticated POST that spends the
 * account's daily download quota. So tracks from here point at this server's
 * own download route, which performs that exchange and normalises the result
 * to WebVTT — a player can't spend a quota or send an API key itself.
 */
export class OpenSubtitlesProvider implements SubtitleProvider {
  readonly name = "opensubtitles";

  private readonly apiKey = process.env.OPENSUBTITLES_KEY || "";

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  supports(query: SubtitleQuery): boolean {
    return Boolean(query.imdbId || query.tmdbId || query.title);
  }

  async search(query: SubtitleQuery): Promise<SubtitleTrack[]> {
    const params = new URLSearchParams({
      languages: query.languages.join(","),
      order_by: "download_count",
      order_direction: "desc",
      per_page: "20",
    });

    if (query.imdbId) {
      params.set("imdb_id", query.imdbId.replace(/^tt/i, ""));
    } else if (query.tmdbId) {
      params.set("tmdb_id", String(query.tmdbId));
    } else if (query.title) {
      params.set("query", query.title);
      if (query.year) params.set("year", String(query.year));
    }

    if (query.season != null) params.set("season_number", String(query.season));
    if (query.episode != null) {
      params.set("episode_number", String(query.episode));
    }

    const response = await fetch(`${API_URL}/subtitles?${params}`, {
      headers: {
        "Api-Key": this.apiKey,
        "User-Agent": "NaijasPride/1.0",
        Accept: "application/json",
      },
    });
    if (!response.ok) return [];

    const json = (await response.json()) as { data?: OpenSubtitlesSubtitle[] };
    const tracks: SubtitleTrack[] = [];

    for (const entry of json.data || []) {
      const file = entry.attributes?.files?.[0];
      if (!file?.file_id) continue;
      const fileId = String(file.file_id);
      const language = entry.attributes?.language || "";
      tracks.push({
        id: fileId,
        provider: this.name,
        language,
        label: file.file_name || language || "Subtitles",
        url: `/api/v1/subtitles/opensubtitles/${fileId}/download`,
        format: "vtt",
        hearingImpaired: entry.attributes?.hearing_impaired === true,
        rank: entry.attributes?.download_count ?? 0,
        release: entry.attributes?.release ?? null,
      });
    }

    return tracks;
  }
}
