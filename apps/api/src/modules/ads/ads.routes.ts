import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { BadRequestError, NotFoundError } from "../../shared/errors/app-error";

const AdPlacementValues = [
  "HOME_FEED",
  "BROWSE_GRID",
  "DETAIL",
  "PLAYER_END",
  "TV_HERO",
] as const;

const placementSchema = z.enum(AdPlacementValues);

const createAdSchema = z.object({
  placement: placementSchema,
  title: z.string().trim().min(1),
  imageUrl: z.string().url(),
  targetUrl: z.string().url().optional(),
  ctaLabel: z.string().trim().min(1).optional(),
  weight: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

const updateAdSchema = z.object({
  placement: placementSchema.optional(),
  title: z.string().trim().min(1).optional(),
  imageUrl: z.string().url().optional(),
  targetUrl: z.string().url().optional().nullable(),
  ctaLabel: z.string().trim().min(1).optional().nullable(),
  weight: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});

const querySchema = z.object({
  placement: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(10).default(3),
});

const paramsSchema = z.object({
  id: z.string().uuid(),
});

function pickWeighted<T extends { weight: number }>(
  items: T[],
  count: number,
): T[] {
  if (items.length === 0) return [];
  const pool = [...items];
  const result: T[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
      result.push(pool.shift()!);
      continue;
    }
    let threshold = Math.random() * totalWeight;
    let idx = 0;
    for (let j = 0; j < pool.length; j++) {
      threshold -= pool[j].weight;
      if (threshold <= 0) {
        idx = j;
        break;
      }
    }
    result.push(pool.splice(idx, 1)[0]);
  }

  return result;
}

export const adRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/v1/ads — public, returns weighted-random active creatives for a placement
  app.get(
    "/",
    {
      schema: {
        querystring: querySchema,
      },
    },
    async (request, reply) => {
      const { placement, limit } = request.query as {
        placement?: string;
        limit: number;
      };

      if (!placement) {
        throw new BadRequestError("placement querystring parameter is required");
      }

      const parsed = placementSchema.safeParse(placement);
      if (!parsed.success) {
        throw new BadRequestError(
          `Invalid placement. Must be one of: ${AdPlacementValues.join(", ")}`,
        );
      }

      const now = new Date();

      const creatives = await fastify.prisma.adCreative.findMany({
        where: {
          placement: parsed.data,
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
      });

      const selected = pickWeighted(creatives, limit);

      return reply.send({ success: true, data: selected });
    },
  );

  // POST /api/v1/ads — create (Admin only)
  app.post(
    "/",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: createAdSchema,
      },
    },
    async (request, reply) => {
      if (request.user.role !== "ADMIN") {
        return reply.status(403).send({
          success: false,
          error: { code: "FORBIDDEN", message: "Admins only" },
        });
      }

      const body = request.body as z.infer<typeof createAdSchema>;

      const creative = await fastify.prisma.adCreative.create({
        data: {
          placement: body.placement,
          title: body.title,
          imageUrl: body.imageUrl,
          targetUrl: body.targetUrl ?? null,
          ctaLabel: body.ctaLabel ?? null,
          weight: body.weight,
          isActive: body.isActive,
          startsAt: body.startsAt ? new Date(body.startsAt) : null,
          endsAt: body.endsAt ? new Date(body.endsAt) : null,
        },
      });

      return reply.status(201).send({ success: true, data: creative });
    },
  );

  // PATCH /api/v1/ads/:id — partial update (Admin only)
  app.patch(
    "/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: paramsSchema,
        body: updateAdSchema,
      },
    },
    async (request, reply) => {
      if (request.user.role !== "ADMIN") {
        return reply.status(403).send({
          success: false,
          error: { code: "FORBIDDEN", message: "Admins only" },
        });
      }

      const { id } = request.params as z.infer<typeof paramsSchema>;
      const body = request.body as z.infer<typeof updateAdSchema>;

      const existing = await fastify.prisma.adCreative.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundError("AdCreative");
      }

      const data: Record<string, unknown> = {};
      if (body.placement !== undefined) data.placement = body.placement;
      if (body.title !== undefined) data.title = body.title;
      if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
      if (body.targetUrl !== undefined) data.targetUrl = body.targetUrl;
      if (body.ctaLabel !== undefined) data.ctaLabel = body.ctaLabel;
      if (body.weight !== undefined) data.weight = body.weight;
      if (body.isActive !== undefined) data.isActive = body.isActive;
      if (body.startsAt !== undefined)
        data.startsAt = body.startsAt ? new Date(body.startsAt) : null;
      if (body.endsAt !== undefined)
        data.endsAt = body.endsAt ? new Date(body.endsAt) : null;

      const updated = await fastify.prisma.adCreative.update({
        where: { id },
        data,
      });

      return reply.send({ success: true, data: updated });
    },
  );

  // DELETE /api/v1/ads/:id — delete (Admin only)
  app.delete(
    "/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: paramsSchema,
      },
    },
    async (request, reply) => {
      if (request.user.role !== "ADMIN") {
        return reply.status(403).send({
          success: false,
          error: { code: "FORBIDDEN", message: "Admins only" },
        });
      }

      const { id } = request.params as z.infer<typeof paramsSchema>;

      const existing = await fastify.prisma.adCreative.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundError("AdCreative");
      }

      await fastify.prisma.adCreative.delete({ where: { id } });

      return reply.send({ success: true, data: { id } });
    },
  );
};
