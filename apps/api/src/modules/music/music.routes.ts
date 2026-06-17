import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { MusicGenre, MusicRegion } from "@prisma/client";
import jwt from "jsonwebtoken";
import { MusicService } from "./music.service";

export const musicRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = new MusicService(fastify.prisma);

  const normalizeGenreToken = (value: string): string =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const genreQueryIndex = new Map<string, MusicGenre>(
    Object.values(MusicGenre).map((genre) => [
      normalizeGenreToken(genre),
      genre,
    ]),
  );

  genreQueryIndex.set(normalizeGenreToken("R&B"), MusicGenre.RAndB);
  genreQueryIndex.set(normalizeGenreToken("R and B"), MusicGenre.RAndB);
  genreQueryIndex.set(normalizeGenreToken("RnB"), MusicGenre.RAndB);

  const parseGenreQuery = (rawGenre?: string): MusicGenre | undefined => {
    if (!rawGenre) return undefined;
    return genreQueryIndex.get(normalizeGenreToken(rawGenre));
  };

  const resolveOptionalUserId = (authHeader?: string): string | undefined => {
    if (!authHeader?.startsWith("Bearer ")) return undefined;

    const secret = process.env.JWT_SECRET;
    if (!secret) return undefined;

    try {
      const token = authHeader.slice("Bearer ".length);
      const decoded = jwt.verify(token, secret) as {
        id?: string;
        type?: "access" | "refresh";
      };

      if (decoded.type && decoded.type !== "access") return undefined;
      return typeof decoded.id === "string" ? decoded.id : undefined;
    } catch {
      return undefined;
    }
  };

  // ── GET /api/v1/music/featured ──────────────────────────────────────────
  app.get("/featured", async (_req, reply) => {
    const data = await service.getFeatured();
    return reply.send({ success: true, data });
  });

  // ── GET /api/v1/music ─── search & browse ──────────────────────────────
  app.get(
    "/",
    {
      schema: {
        querystring: z.object({
          q: z.string().trim().optional(),
          genre: z.string().trim().optional(),
          region: z.nativeEnum(MusicRegion).optional(),
          artist: z.string().trim().optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(50).default(24),
        }),
      },
    },
    async (req, reply) => {
      const genre = parseGenreQuery(req.query.genre);
      if (req.query.genre && !genre) {
        return reply.status(400).send({
          success: false,
          error: { code: "INVALID_QUERY", message: "Invalid genre filter" },
        });
      }

      const result = await service.search({
        q: req.query.q,
        genre,
        region: req.query.region,
        artist: req.query.artist,
        page: req.query.page,
        limit: req.query.limit,
      });
      return reply.send({ success: true, ...result });
    },
  );

  // ── GET /api/v1/music/artist/:slug ─────────────────────────────────────
  app.get(
    "/artist/:slug",
    {
      schema: {
        params: z.object({ slug: z.string() }),
      },
    },
    async (req, reply) => {
      const page = await service.getArtistPage(req.params.slug);
      if (!page) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Artist not found" },
        });
      }
      return reply.send({ success: true, data: page });
    },
  );

  // ── GET /api/v1/music/playlist/:id ─────────────────────────────────────
  app.get(
    "/playlist/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (req, reply) => {
      const userId = resolveOptionalUserId(req.headers.authorization);

      const playlist = await service.getPlaylist(req.params.id, userId);
      if (!playlist) {
        return reply.status(404).send({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Playlist not found or private",
          },
        });
      }
      return reply.send({ success: true, data: playlist });
    },
  );

  // ── GET /api/v1/music/recommendations ─────────────────────────────────
  app.get(
    "/recommendations",
    {
      onRequest: [fastify.authenticate],
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(24).default(12),
        }),
      },
    },
    async (req, reply) => {
      const recs = await service.getRecommendations(
        req.user.id,
        req.query.limit,
      );
      return reply.send({ success: true, data: recs });
    },
  );

  // ── GET /api/v1/music/:slug ─────────────────────────────────────────────
  app.get(
    "/:slug",
    {
      schema: {
        params: z.object({ slug: z.string() }),
      },
    },
    async (req, reply) => {
      const userId = resolveOptionalUserId(req.headers.authorization);

      const video = await service.findBySlug(req.params.slug, userId);
      if (!video) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Music video not found" },
        });
      }

      // Increment view count (fire-and-forget)
      service.incrementView(video.id).catch(() => {});

      return reply.send({ success: true, data: video });
    },
  );

  // ── GET /api/v1/music/:slug/related ────────────────────────────────────
  app.get(
    "/:slug/related",
    {
      schema: {
        params: z.object({ slug: z.string() }),
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(20).default(8),
        }),
      },
    },
    async (req, reply) => {
      const video = await service.findBySlug(req.params.slug);
      if (!video) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Music video not found" },
        });
      }
      const related = await service.getRelated(video.id, req.query.limit);
      return reply.send({ success: true, data: related });
    },
  );

  // ── POST /api/v1/music/:id/play ─────────────────────────────────────────
  app.post(
    "/:id/play",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (req, reply) => {
      const userId = resolveOptionalUserId(req.headers.authorization);

      await service.incrementPlay(req.params.id, userId);
      return reply.send({ success: true });
    },
  );

  // ── POST /api/v1/music/:id/like ─────────────────────────────────────────
  app.post(
    "/:id/like",
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (req, reply) => {
      const result = await service.toggleLike(req.params.id, req.user.id);
      return reply.send({ success: true, data: result });
    },
  );

  // ── GET /api/v1/music/playlists/mine ────────────────────────────────────
  app.get(
    "/playlists/mine",
    {
      onRequest: [fastify.authenticate],
    },
    async (req, reply) => {
      const playlists = await service.getUserPlaylists(req.user.id);
      return reply.send({ success: true, data: playlists });
    },
  );

  // ── POST /api/v1/music/playlists ────────────────────────────────────────
  app.post(
    "/playlists",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: z.object({
          title: z.string().trim().min(1).max(100),
          description: z.string().trim().max(500).optional(),
          isPublic: z.boolean().default(false),
        }),
      },
    },
    async (req, reply) => {
      const pl = await service.createPlaylist(
        req.user.id,
        req.body.title,
        req.body.description,
        req.body.isPublic,
      );
      return reply.status(201).send({ success: true, data: pl });
    },
  );

  // ── POST /api/v1/music/playlists/:id/items ──────────────────────────────
  app.post(
    "/playlists/:id/items",
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ musicId: z.string().uuid() }),
      },
    },
    async (req, reply) => {
      try {
        const item = await service.addToPlaylist(
          req.params.id,
          req.body.musicId,
          req.user.id,
        );
        return reply.status(201).send({ success: true, data: item });
      } catch (err) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Unknown error",
          },
        });
      }
    },
  );
};
