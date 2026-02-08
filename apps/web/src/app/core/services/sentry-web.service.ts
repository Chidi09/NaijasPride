type SentryWebContext = Record<string, unknown>;

type SentryWebConfig = {
  endpoint: string;
  environment?: string;
  release?: string;
} | null;

let initialized = false;

const makeEventId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const readMeta = (name: string) =>
  document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || undefined;

const buildConfig = (): SentryWebConfig => {
  const dsn = (window as { __SENTRY_DSN__?: string }).__SENTRY_DSN__ || readMeta("sentry-dsn");
  if (!dsn) return null;

  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.split("/").filter(Boolean).at(-1);
    const publicKey = parsed.username;
    if (!projectId || !publicKey) return null;

    return {
      endpoint: `${parsed.protocol}//${parsed.host}/api/${projectId}/store/?sentry_version=7&sentry_key=${publicKey}`,
      environment: readMeta("sentry-environment"),
      release: readMeta("app-release"),
    };
  } catch {
    return null;
  }
};

const config = buildConfig();

const postEvent = async (payload: unknown) => {
  if (!config) return;
  try {
    await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      keepalive: true,
      body: JSON.stringify(payload),
    });
  } catch {
    // telemetry must never throw
  }
};

export const captureSentryWebException = (error: unknown, context: SentryWebContext = {}) => {
  if (!config) return;
  const normalized = error instanceof Error ? error : new Error(String(error));
  const event = {
    event_id: makeEventId(),
    platform: "javascript",
    level: "error",
    message: normalized.message,
    environment: config.environment,
    release: config.release,
    tags: { service: "web" },
    extra: context,
    exception: {
      values: [
        {
          type: normalized.name || "Error",
          value: normalized.message,
          stacktrace: {
            frames: (normalized.stack?.split("\n") || []).map((line, index) => ({
              function: line.trim(),
              lineno: index + 1,
            })),
          },
        },
      ],
    },
  };

  void postEvent(event);
};

export const initSentryWebHandlers = () => {
  if (!config || initialized) return;
  initialized = true;

  window.addEventListener("error", (event) => {
    captureSentryWebException(event.error || event.message, {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    captureSentryWebException(event.reason, { type: "unhandledrejection" });
  });
};

export const isSentryWebEnabled = () => !!config;
