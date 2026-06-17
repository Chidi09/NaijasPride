export type FetchRequestOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  responseType?: "text" | "json";
  sourceId?: string;
};

export type FetchResponse = {
  url: string;
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  fetchedVia: "direct" | "flaresolverr";
};

export interface SourceFetcher {
  id: "direct" | "flaresolverr";
  canHandle(url: string, options?: FetchRequestOptions): boolean;
  get(url: string, options?: FetchRequestOptions): Promise<FetchResponse>;
}
