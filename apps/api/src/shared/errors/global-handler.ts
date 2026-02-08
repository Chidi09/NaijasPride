import { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "./app-error";
import { sentryService } from "../services/sentry.service";

type PrismaLikeKnownError = {
  code: string;
  meta?: { target?: string[] | string };
};

const isPrismaLikeKnownError = (error: unknown): error is PrismaLikeKnownError => {
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

    // 5. Unknown Server Errors (Log these! Don't leak info to user)
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
