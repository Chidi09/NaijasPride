import axios from "axios";
import { FetchRequestOptions, FetchResponse, SourceFetcher } from "./types";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Connection: "keep-alive",
};

const normalizeHeaders = (
  headers: Record<string, unknown>,
): Record<string, string | string[] | undefined> => {
  const normalized: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (
      typeof value === "string" ||
      Array.isArray(value) ||
      typeof value === "undefined"
    ) {
      normalized[key] = value;
      continue;
    }

    if (value === null) {
      normalized[key] = undefined;
      continue;
    }

    normalized[key] = String(value);
  }
  return normalized;
};

export class DirectHttpFetcher implements SourceFetcher {
  readonly id = "direct" as const;

  canHandle(): boolean {
    return true;
  }

  async get(
    url: string,
    options: FetchRequestOptions = {},
  ): Promise<FetchResponse> {
    const response = await axios.get<string>(url, {
      headers: {
        ...DEFAULT_HEADERS,
        ...(options.headers || {}),
      },
      timeout: options.timeoutMs ?? 15_000,
      responseType: "text",
      validateStatus: () => true,
    });

    return {
      url,
      status: response.status,
      headers: normalizeHeaders(response.headers as Record<string, unknown>),
      body:
        typeof response.data === "string"
          ? response.data
          : String(response.data || ""),
      fetchedVia: this.id,
    };
  }
}
