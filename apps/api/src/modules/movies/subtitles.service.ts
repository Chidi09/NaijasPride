import axios from "axios";

export interface SubtitleResult {
  id: string;
  language: string;
  url: string;
  filename: string;
  hearingImpaired: boolean;
  hd: boolean;
  downloads: number;
}

interface OpenSubtitlesFile {
  file_id: number;
  file_name: string;
  cd_number?: number;
  file_type?: string;
}

interface OpenSubtitlesAttributes {
  language: string;
  files: OpenSubtitlesFile[];
  hearing_impaired?: boolean;
  hd?: boolean;
  download_count?: number;
  [key: string]: unknown;
}

interface OpenSubtitlesSubtitle {
  id: string;
  type: string;
  attributes: OpenSubtitlesAttributes;
}

/**
 * Converts SRT subtitle format to WebVTT format
 * WebVTT format:
 * WEBVTT
 *
 * 00:00:01.000 --> 00:00:04.000
 * Subtitle text here
 *
 * 00:00:05.000 --> 00:00:08.000
 * More text
 */
export function srtToVtt(srtContent: string): string {
  // Add WEBVTT header
  let vtt = "WEBVTT\n\n";

  // Remove BOM if present
  const content = srtContent.replace(/^\uFEFF/, "");

  // Split by subtitle blocks (separated by empty lines)
  const blocks = content.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    // First line might be a number (subtitle index) - skip it
    let timeLineIndex = 0;
    if (/^\d+$/.test(lines[0].trim())) {
      timeLineIndex = 1;
    }

    if (timeLineIndex >= lines.length) continue;

    // Convert time line from SRT to VTT format
    // SRT: 00:00:01,000 --> 00:00:04,000
    // VTT: 00:00:01.000 --> 00:00:04.000
    const timeLine = lines[timeLineIndex];
    const vttTimeLine = timeLine.replace(/,/g, ".");

    // Collect subtitle text lines
    const textLines = lines.slice(timeLineIndex + 1);
    if (textLines.length === 0) continue;

    vtt += `${vttTimeLine}\n${textLines.join("\n")}\n\n`;
  }

  return vtt.trim();
}

/**
 * Downloads a subtitle and converts to VTT format
 */
export async function downloadAndConvertSubtitle(
  downloadUrl: string,
  fileName: string,
): Promise<{ content: string; isVtt: boolean }> {
  try {
    const response = await axios.get(downloadUrl, {
      responseType: "text",
      timeout: 30000,
    });

    const content = response.data;
    const isSrt = fileName.toLowerCase().endsWith(".srt");

    if (isSrt) {
      return { content: srtToVtt(content), isVtt: true };
    } else {
      return { content, isVtt: fileName.toLowerCase().endsWith(".vtt") };
    }
  } catch (error) {
    console.error("Failed to download subtitle:", error);
    throw new Error("Failed to download subtitle");
  }
}

export class SubtitleService {
  private readonly API_URL = "https://api.opensubtitles.com/api/v1";
  private readonly API_KEY = process.env.OPENSUBTITLES_KEY || "";

  constructor() {
    if (!this.API_KEY) {
      console.warn(
        "⚠️  OPENSUBTITLES_KEY not set. Subtitle service will not work.",
      );
    }
  }

  async search(
    imdbId: string,
    language: string = "en",
  ): Promise<SubtitleResult[]> {
    if (!this.API_KEY) {
      console.warn("OpenSubtitles API key not configured");
      return [];
    }

    try {
      // Clean IMDB ID (remove 'tt' prefix if present)
      const cleanId = imdbId.replace(/^tt/i, "");

      const response = await axios.get(`${this.API_URL}/subtitles`, {
        params: {
          imdb_id: cleanId,
          languages: language,
          order_by: "download_count",
          order_direction: "desc",
          per_page: 10,
        },
        headers: {
          "Api-Key": this.API_KEY,
          "User-Agent": "NaijasPride/1.0",
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      if (!response.data.data || !Array.isArray(response.data.data)) {
        return [];
      }

      // Transform to our format
      return response.data.data
        .filter(
          (sub: OpenSubtitlesSubtitle) =>
            sub.attributes &&
            sub.attributes.files &&
            sub.attributes.files.length > 0,
        )
        .slice(0, 5)
        .map((sub: OpenSubtitlesSubtitle) => ({
          id: sub.id,
          language: sub.attributes.language,
          url: sub.attributes.files[0].file_id.toString(),
          filename: sub.attributes.files[0].file_name,
          hearingImpaired: sub.attributes.hearing_impaired || false,
          hd: sub.attributes.hd || false,
          downloads: sub.attributes.download_count || 0,
        }));
    } catch (error: unknown) {
      const err = error as any;
      console.error("Subtitle fetch failed:", err.message);
      if (err.response) {
        console.error("API Response:", err.response.status, err.response.data);
      }
      return [];
    }
  }

  async getDownloadLink(
    fileId: string,
  ): Promise<{ link: string; fileName: string } | null> {
    if (!this.API_KEY) return null;

    try {
      const response = await axios.post(
        `${this.API_URL}/download`,
        {
          file_id: parseInt(fileId),
        },
        {
          headers: {
            "Api-Key": this.API_KEY,
            "User-Agent": "NaijasPride/1.0",
            "Content-Type": "application/json",
          },
          timeout: 10000,
        },
      );

      if (response.data && response.data.link) {
        return {
          link: response.data.link,
          fileName: response.data.file_name || "subtitle.srt",
        };
      }

      return null;
    } catch (error: unknown) {
      const err = error as any;
      console.error("Download link fetch failed:", err.message);
      return null;
    }
  }

  // Search by movie name and year
  async searchByTitle(
    title: string,
    year?: number,
    language: string = "en",
  ): Promise<SubtitleResult[]> {
    if (!this.API_KEY) return [];

    try {
      const params: Record<string, string | number> = {
        query: title,
        languages: language,
        order_by: "download_count",
        order_direction: "desc",
        per_page: 10,
      };

      if (year) {
        params.year = year;
      }

      const response = await axios.get(`${this.API_URL}/subtitles`, {
        params,
        headers: {
          "Api-Key": this.API_KEY,
          "User-Agent": "NaijasPride/1.0",
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      if (!response.data.data || !Array.isArray(response.data.data)) {
        return [];
      }

      return response.data.data
        .filter(
          (sub: OpenSubtitlesSubtitle) =>
            sub.attributes &&
            sub.attributes.files &&
            sub.attributes.files.length > 0,
        )
        .slice(0, 5)
        .map((sub: OpenSubtitlesSubtitle) => ({
          id: sub.id,
          language: sub.attributes.language,
          url: sub.attributes.files[0].file_id.toString(),
          filename: sub.attributes.files[0].file_name,
          hearingImpaired: sub.attributes.hearing_impaired || false,
          hd: sub.attributes.hd || false,
          downloads: sub.attributes.download_count || 0,
        }));
    } catch (error: unknown) {
      const err = error as any;
      console.error("Subtitle search by title failed:", err.message);
      return [];
    }
  }
}
