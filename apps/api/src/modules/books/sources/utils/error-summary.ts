type MaybeAxiosLikeError = {
  message?: string;
  code?: string;
  response?: {
    status?: number;
    statusText?: string;
    config?: {
      url?: string;
      method?: string;
    };
  };
};

export const summarizeSourceError = (error: unknown): string => {
  if (!error || typeof error !== "object") {
    return "unknown error";
  }

  const err = error as MaybeAxiosLikeError;
  const status = err.response?.status;
  const statusText = err.response?.statusText;
  const method = err.response?.config?.method?.toUpperCase();
  const url = err.response?.config?.url;
  const code = err.code;
  const message = err.message || "request failed";

  const parts = [message];
  if (typeof status === "number") {
    parts.push(`status=${status}${statusText ? ` ${statusText}` : ""}`);
  }
  if (code) {
    parts.push(`code=${code}`);
  }
  if (method || url) {
    parts.push(`request=${method || "GET"} ${url || "unknown-url"}`);
  }

  return parts.join(" | ");
};
