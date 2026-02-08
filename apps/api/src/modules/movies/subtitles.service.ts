import axios from "axios";

interface SubtitleResult {
  id: string;
  language: string;
  url: string;
  filename: string;
  hearingImpaired: boolean;
  hd: boolean;
  downloads: number;
}

export class SubtitleService {
  private readonly API_URL = "https://api.opensubtitles.com/api/v1";
  private readonly API_KEY = process.env.OPENSUBTITLES_KEY || "";

  constructor() {
    if (!this.API_KEY) {
      console.warn("⚠️  OPENSUBTITLES_KEY not set. Subtitle service will not work.");
    }
  }

  async search(imdbId: string, language: string = "en"): Promise<SubtitleResult[]> {
    if (!this.API_KEY) {
      console.warn("OpenSubtitles API key not configured");
      return [];
    }

    try {
      // Clean IMDB ID (remove 'tt' prefix if present)
      const cleanId = imdbId.replace(/^tt/i, "");

      const response = await axios.get(
        `${this.API_URL}/subtitles`,
        {
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
        }
      );

      if (!response.data.data || !Array.isArray(response.data.data)) {
        return [];
      }

      // Transform to our format
      return response.data.data
        .filter((sub: any) => sub.attributes && sub.attributes.files && sub.attributes.files.length > 0)
        .slice(0, 5)
        .map((sub: any) => ({
          id: sub.id,
          language: sub.attributes.language,
          url: sub.attributes.files[0].file_id.toString(),
          filename: sub.attributes.files[0].file_name,
          hearingImpaired: sub.attributes.hearing_impaired || false,
          hd: sub.attributes.hd || false,
          downloads: sub.attributes.download_count || 0,
        }));
    } catch (error: any) {
      console.error("Subtitle fetch failed:", error.message);
      if (error.response) {
        console.error("API Response:", error.response.status, error.response.data);
      }
      return [];
    }
  }

  async getDownloadLink(fileId: string): Promise<{ link: string; fileName: string } | null> {
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
        }
      );

      if (response.data && response.data.link) {
        return {
          link: response.data.link,
          fileName: response.data.file_name || "subtitle.srt",
        };
      }

      return null;
    } catch (error: any) {
      console.error("Download link fetch failed:", error.message);
      return null;
    }
  }

  // Search by movie name and year
  async searchByTitle(title: string, year?: number, language: string = "en"): Promise<SubtitleResult[]> {
    if (!this.API_KEY) return [];

    try {
      const params: any = {
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
        .filter((sub: any) => sub.attributes && sub.attributes.files && sub.attributes.files.length > 0)
        .slice(0, 5)
        .map((sub: any) => ({
          id: sub.id,
          language: sub.attributes.language,
          url: sub.attributes.files[0].file_id.toString(),
          filename: sub.attributes.files[0].file_name,
          hearingImpaired: sub.attributes.hearing_impaired || false,
          hd: sub.attributes.hd || false,
          downloads: sub.attributes.download_count || 0,
        }));
    } catch (error: any) {
      console.error("Subtitle search by title failed:", error.message);
      return [];
    }
  }
}
