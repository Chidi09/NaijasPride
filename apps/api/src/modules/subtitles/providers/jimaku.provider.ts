import type {
  SubtitleProvider,
  SubtitleQuery,
  SubtitleTrack,
} from "../subtitle-provider";

const API_BASE = "https://jimaku.cc/api";

type JimakuEntry = {
  id?: number;
  name?: string;
  english_name?: string;
  japanese_name?: string;
};

type JimakuFile = {
  url?: string;
  name?: string;
  size?: number;
  last_modified?: string;
};

/**
 * Anime-only, and the one provider that identifies a series exactly: Jimaku
 * requires an AniList id on every entry, so a lookup here is an id match
 * rather than a title guess. That matters because anime numbering disagrees
 * constantly between databases, and a mismatched subtitle file is worse than
 * none.
 *
 * The catalogue is Japanese, which is declared below so the resolver skips
 * this provider entirely for a request that asked for another language. That
 * matters more than it sounds: this is the only provider that accepts an
 * AniList id, so before it declared itself it was the sole answer to every
 * anime subtitle request, and English requests came back Japanese.
 */
export class JimakuProvider implements SubtitleProvider {
  readonly name = "jimaku";

  readonly languages = ["ja"] as const;

  private readonly apiKey = process.env.JIMAKU_API_KEY || "";

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  supports(query: SubtitleQuery): boolean {
    return Boolean(query.anilistId);
  }

  private headers(): Record<string, string> {
    // Jimaku's scheme is a bare key in Authorization, not a Bearer token.
    return { Authorization: this.apiKey, Accept: "application/json" };
  }

  async search(query: SubtitleQuery): Promise<SubtitleTrack[]> {
    const searchParams = new URLSearchParams({
      anilist_id: String(query.anilistId),
    });
    const entriesResponse = await fetch(
      `${API_BASE}/entries/search?${searchParams}`,
      { headers: this.headers() },
    );
    if (!entriesResponse.ok) return [];

    const entries = (await entriesResponse.json()) as JimakuEntry[];
    const entry = Array.isArray(entries) ? entries[0] : null;
    if (!entry?.id) return [];

    const fileParams = new URLSearchParams();
    if (query.episode != null) {
      fileParams.set("episode", String(query.episode));
    }
    const suffix = fileParams.toString() ? `?${fileParams}` : "";
    const filesResponse = await fetch(
      `${API_BASE}/entries/${entry.id}/files${suffix}`,
      { headers: this.headers() },
    );
    if (!filesResponse.ok) return [];

    const files = (await filesResponse.json()) as JimakuFile[];
    if (!Array.isArray(files)) return [];

    const tracks: SubtitleTrack[] = [];
    for (const file of files) {
      if (!file.url || !file.name) continue;
      const format = file.name.split(".").pop()?.toLowerCase() || "srt";
      if (!["srt", "vtt", "ass", "ssa"].includes(format)) continue;
      tracks.push({
        id: file.url,
        provider: this.name,
        // Jimaku does not label a file's language; the catalogue is
        // overwhelmingly Japanese, and claiming otherwise would sort these
        // ahead of a real English track.
        language: "ja",
        label: file.name,
        url: file.url,
        format,
        hearingImpaired: false,
        rank: 0,
      });
    }
    return tracks;
  }
}
