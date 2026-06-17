import { randomUUID } from "crypto";

type SentryContext = Record<string, unknown>;

type SentryConfig = {
  endpoint: string;
  dsn: string;
  environment?: string;
  release?: string;
} | null;

const buildSentryConfig = (): SentryConfig => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;

  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.split("/").filter(Boolean).at(-1);
    const publicKey = parsed.username;
    if (!projectId || !publicKey) return null;

    const endpoint = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/?sentry_version=7&sentry_key=${publicKey}`;
    return {
      endpoint,
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE,
    };
  } catch {
    return null;
  }
};

const toError = (value: unknown) =>
  value instanceof Error
    ? value
    : new Error(typeof value === "string" ? value : "Unknown error");

export class SentryService {
  private readonly config = buildSentryConfig();

  get enabled() {
    return !!this.config;
  }

  async captureException(error: unknown, context: SentryContext = {}) {
    if (!this.config) return;
    const normalizedError = toError(error);
    const eventId = randomUUID().replace(/-/g, "");
    const stackLines = normalizedError.stack?.split("\n") || [];

    const payload = {
      event_id: eventId,
      platform: "node",
      level: "error",
      message: normalizedError.message,
      timestamp: Math.floor(Date.now() / 1000),
      environment: this.config.environment,
      release: this.config.release,
      tags: {
        service: "api",
      },
      extra: context,
      exception: {
        values: [
          {
            type: normalizedError.name || "Error",
            value: normalizedError.message,
            stacktrace: {
              frames: stackLines.map((line, index) => ({
                function: line.trim(),
                lineno: index + 1,
              })),
            },
          },
        ],
      },
    };

    try {
      await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Never throw from telemetry pipeline.
    }
  }
}

export const sentryService = new SentryService();
