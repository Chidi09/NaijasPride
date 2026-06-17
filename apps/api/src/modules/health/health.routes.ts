import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/",
    {
      schema: {
        summary: "Health check",
        response: {
          200: z.object({
            status: z.literal("ok"),
            timestamp: z.string(),
          }),
        },
      },
    },
    async () => {
      return {
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      };
    },
  );
};
