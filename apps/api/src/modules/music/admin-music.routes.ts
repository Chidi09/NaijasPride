import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { MusicGenre, MusicRegion } from "@prisma/client";
import { YouTubeMusicService } from "./youtube-music.service";
import { ForbiddenError, NotFoundError } from "../../shared/errors/app-error";

const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
  if ((req.user as any)?.role !== "ADMIN") {
    throw new ForbiddenError("Admins only");
  }
};

export const adminMusicRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = new YouTubeMusicService(fastify.prisma);

  const updateVideoBodySchema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    artist: z.string().trim().min(1).max(100).optional(),
    featuring: z.array(z.string()).optional(),
    genre: z.array(z.nativeEnum(MusicGenre)).optional(),
    region: z.nativeEnum(MusicRegion).optional(),
    isOfficial: z.boolean().optional(),
    isExplicit: z.boolean().optional(),
    status: z.enum(["active", "pending", "deleted"]).optional(),
  });

  // ── GET /api/v1/admin/music/channels ───────────────────────────────────
  app.get(
    "/channels",
    {
      onRequest: [fastify.authenticate],
      preHandler: [requireAdmin],
    },
    async (_req, reply) => {
      const channels = await service.listChannels();
      return reply.send({ success: true, data: channels });
    },
  );

  // ── POST /api/v1/admin/music/channels ──────────────────────────────────
  app.post(
    "/channels",
    {
      onRequest: [fastify.authenticate],
      preHandler: [requireAdmin],
      schema: {
        body: z.object({
          url: z.string().url(),
          artistName: z.string().trim().min(1).max(100).optional(),
          region: z.nativeEnum(MusicRegion).default(MusicRegion.Nigeria),
        }),
      },
    },
    async (req, reply) => {
      const channel = await service.addChannel(
        req.body.url,
        req.body.artistName,
        req.body.region,
      );
      return reply.status(201).send({ success: true, data: channel });
    },
  );

  // ── DELETE /api/v1/admin/music/channels/:id ────────────────────────────
  app.delete(
    "/channels/:id",
    {
      onRequest: [fastify.authenticate],
      preHandler: [requireAdmin],
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (req, reply) => {
      await service.deleteChannel(req.params.id);
      return reply.send({ success: true });
    },
  );

  // ── POST /api/v1/admin/music/channels/:channelId/import ───────────────
  app.post(
    "/channels/:channelId/import",
    {
      onRequest: [fastify.authenticate],
      preHandler: [requireAdmin],
      schema: {
        params: z.object({ channelId: z.string().min(1) }),
        body: z
          .object({
            batchSize: z.number().int().min(1).max(50).default(10),
          })
          .default({}),
      },
    },
    async (req, reply) => {
      const progressId = await service.startImport(
        req.params.channelId,
        req.body.batchSize,
      );
      return reply.send({ success: true, data: { progressId } });
    },
  );

  // ── GET /api/v1/admin/music/import/:progressId ────────────────────────
  app.get(
    "/import/:progressId",
    {
      onRequest: [fastify.authenticate],
      preHandler: [requireAdmin],
      schema: {
        params: z.object({ progressId: z.string().min(1) }),
      },
    },
    async (req, reply) => {
      const progress = service.getImportProgress(req.params.progressId);
      if (!progress) {
        throw new NotFoundError("Import job");
      }
      return reply.send({ success: true, data: progress });
    },
  );

  // ── POST /api/v1/admin/music/monitor ──────────────────────────────────
  // Manually trigger the 6-hour monitor cycle
  app.post(
    "/monitor",
    {
      onRequest: [fastify.authenticate],
      preHandler: [requireAdmin],
    },
    async (_req, reply) => {
      service
        .monitorAll()
        .catch((err) => console.error("[AdminMusicMonitor] Error:", err));
      return reply.send({
        success: true,
        message: "Monitor started in background",
      });
    },
  );

  // ── POST /api/v1/admin/music/videos ───────────────────────────────────
  // Manually create a music video record (e.g. for non-channel imports)
  app.post(
    "/videos",
    {
      onRequest: [fastify.authenticate],
      preHandler: [requireAdmin],
      schema: {
        body: z.object({
          youtubeId: z.string().min(5).max(20),
          title: z.string().trim().min(1).max(200),
          artist: z.string().trim().min(1).max(100),
          artistSlug: z.string().trim().min(1).max(100).optional(),
          featuring: z.array(z.string()).default([]),
          year: z
            .number()
            .int()
            .min(1950)
            .max(new Date().getFullYear() + 1),
          region: z.nativeEnum(MusicRegion).default(MusicRegion.Nigeria),
          isOfficial: z.boolean().default(true),
          isExplicit: z.boolean().default(false),
        }),
      },
    },
    async (req, reply) => {
      const {
        youtubeId,
        title,
        artist,
        featuring,
        year,
        region,
        isOfficial,
        isExplicit,
      } = req.body;
      const artistSlug =
        req.body.artistSlug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const slug = `${artistSlug}-${titleSlug}-${year}`;

      const video = await fastify.prisma.musicVideo.create({
        data: {
          title,
          slug,
          artist,
          artistSlug,
          featuring,
          year,
          genre: [],
          region,
          youtubeId,
          isOfficial,
          isExplicit,
          status: "active",
        },
      });

      return reply.status(201).send({ success: true, data: video });
    },
  );

  // ── PATCH /api/v1/admin/music/videos/:id ─────────────────────────────
  app.patch(
    "/videos/:id",
    {
      onRequest: [fastify.authenticate],
      preHandler: [requireAdmin],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: updateVideoBodySchema,
      },
    },
    async (req, reply) => {
      const video = await fastify.prisma.musicVideo.update({
        where: { id: req.params.id },
        data: req.body,
      });
      return reply.send({ success: true, data: video });
    },
  );

  // ── DELETE /api/v1/admin/music/videos/:id ────────────────────────────
  app.delete(
    "/videos/:id",
    {
      onRequest: [fastify.authenticate],
      preHandler: [requireAdmin],
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (req, reply) => {
      await fastify.prisma.musicVideo.update({
        where: { id: req.params.id },
        data: { status: "deleted" },
      });
      return reply.send({ success: true });
    },
  );
};
