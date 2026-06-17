import { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "./app-error";
import { sentryService } from "../services/sentry.service";

type PrismaLikeKnownError = {
  code: string;
  meta?: { target?: string[] | string };
};

const isPrismaLikeKnownError = (
  error: unknown,
): error is PrismaLikeKnownError => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
};

export async function globalErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error, request, reply) => {
    const requestUserId = (request as { user?: { id?: string } }).user?.id;

    // 1. Custom App Errors (Manual throws)
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { data: error.details } : {}),
      });
    }

    // 2. Zod Validation Errors (Input Validation)
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        code: "VALIDATION_ERROR",
        message: "Invalid input data",
        errors: error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      });
    }

    // 3. Prisma Database Errors
    if (isPrismaLikeKnownError(error)) {
      const dbError = error as PrismaLikeKnownError;
      // P2002: Unique constraint failed (e.g., Duplicate Email)
      if (dbError.code === "P2002") {
        const target = Array.isArray(dbError.meta?.target)
          ? dbError.meta?.target.join(", ")
          : typeof dbError.meta?.target === "string"
            ? dbError.meta?.target
            : "Field";
        return reply.status(409).send({
          success: false,
          code: "DUPLICATE_ENTRY",
          message: `${target} already exists.`,
        });
      }
      // P2025: Record not found
      if (dbError.code === "P2025") {
        return reply.status(404).send({
          success: false,
          code: "NOT_FOUND",
          message: "Resource not found.",
        });
      }
      // P2003: Foreign key constraint failed
      if (dbError.code === "P2003") {
        return reply.status(400).send({
          success: false,
          code: "FOREIGN_KEY_VIOLATION",
          message: "Foreign key constraint failed.",
        });
      }
      // P2011: Null constraint violation
      if (dbError.code === "P2011") {
        return reply.status(400).send({
          success: false,
          code: "NULL_CONSTRAINT_VIOLATION",
          message: "Null constraint violation.",
        });
      }
      // P2014: Required relation violation
      if (dbError.code === "P2014") {
        return reply.status(409).send({
          success: false,
          code: "RELATION_VIOLATION",
          message: "Relation constraint violation.",
        });
      }
    }

    // 4. JWT Auth Errors
    if (
      error.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" ||
      error.code === "FST_JWT_AUTHORIZATION_TOKEN_EXPIRED"
    ) {
      return reply.status(401).send({
        success: false,
        code: "UNAUTHORIZED",
        message: "You must be logged in to access this.",
      });
    }

    // 5. Fastify/plugin errors that already carry the correct HTTP status
    //    (e.g. rate-limit 429, not-found 404). Forward them as-is instead of
    //    masking as 500.
    const knownStatus = (error as { statusCode?: number }).statusCode;
    if (knownStatus && knownStatus >= 400 && knownStatus < 500) {
      return reply.status(knownStatus).send({
        success: false,
        code: error.code || "CLIENT_ERROR",
        message: error.message || "Request error.",
      });
    }

    // 6. Unknown Server Errors (Log these! Don't leak info to user)
    fastify.log.error(error); // Logs full stack trace internally
    sentryService.captureException(error, {
      requestId: request.id,
      method: request.method,
      url: request.url,
      userId: requestUserId,
    });
    return reply.status(500).send({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong. Our team has been notified.",
    });
  });
}
