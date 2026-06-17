export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 400,
    code = "GENERIC_ERROR",
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 — Caller sent invalid data that Zod didn't catch */
export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

/** 401 — Not authenticated */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", details?: unknown) {
    super(message, 401, "UNAUTHORIZED", details);
  }
}

/** 403 — Authenticated but not allowed */
export class ForbiddenError extends AppError {
  constructor(
    message = "You do not have permission to do this",
    details?: unknown,
  ) {
    super(message, 403, "FORBIDDEN", details);
  }
}

/** 404 — Resource does not exist */
export class NotFoundError extends AppError {
  constructor(messageOrResource = "Resource", details?: unknown) {
    const message = messageOrResource.toLowerCase().includes("not found")
      ? messageOrResource
      : `${messageOrResource} not found`;
    super(message, 404, "NOT_FOUND", details);
  }
}

/** 409 — Conflict (e.g. duplicate slug, already-subscribed) */
export class ConflictError extends AppError {
  constructor(message = "A conflict occurred", details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

/** 422 — Business logic rejection (e.g. payment already processed) */
export class UnprocessableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "UNPROCESSABLE", details);
  }
}

/** 502 — Bad Gateway / Upstream dependency failed */
export class ExternalServiceError extends AppError {
  public readonly cause?: unknown;

  constructor(
    message = "External service integration failed",
    options?: { cause?: unknown; details?: unknown },
  ) {
    super(message, 502, "BAD_GATEWAY", options?.details);
    this.cause = options?.cause;
  }
}

/** 503 — Upstream dependency unavailable */
export class ServiceUnavailableError extends AppError {
  constructor(service = "Upstream service") {
    super(`${service} is temporarily unavailable`, 503, "SERVICE_UNAVAILABLE");
  }
}
