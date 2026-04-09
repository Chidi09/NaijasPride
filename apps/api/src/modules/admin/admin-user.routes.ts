import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  isPremium: z.boolean().optional(),
  subStatus: z
    .enum(["active", "inactive", "cancelled", "expired", "past_due"])
    .optional(),
  emailVerified: z.boolean().optional(),
});

const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  isPremium: z.coerce.boolean().optional(),
});

export const adminUserRoutes = async (app: FastifyInstance) => {
  // GET /api/admin/users - List all users with pagination and filters
  app.get("/users", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request, reply) => {
      try {
        const { page, limit, search, role, isPremium } =
          ListUsersQuerySchema.parse(request.query);
        const skip = (page - 1) * limit;

        const where: any = {};
        if (search) {
          where.OR = [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ];
        }
        if (role) where.role = role;
        if (typeof isPremium === "boolean") where.isPremium = isPremium;

        const [users, total] = await Promise.all([
          app.prisma.user.findMany({
            where,
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              isPremium: true,
              emailVerified: true,
              subStatus: true,
              subStartDate: true,
              nextBillingDate: true,
              createdAt: true,
              updatedAt: true,
              _count: {
                select: {
                  watchlist: true,
                  downloadHistory: true,
                  watchHistory: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
          }),
          app.prisma.user.count({ where }),
        ]);

        return reply.send({
          status: "success",
          data: users,
          meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1,
          },
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to fetch users",
        });
      }
    },
  });

  // GET /api/admin/users/stats - Get user statistics
  // IMPORTANT: This route must be registered BEFORE /users/:id to avoid being shadowed
  app.get("/users/stats", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (_request, reply) => {
      try {
        const [total, admins, premium, verified, recent] = await Promise.all([
          app.prisma.user.count(),
          app.prisma.user.count({ where: { role: "ADMIN" } }),
          app.prisma.user.count({ where: { isPremium: true } }),
          app.prisma.user.count({ where: { emailVerified: true } }),
          app.prisma.user.count({
            where: {
              createdAt: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              },
            },
          }),
        ]);

        return reply.send({
          status: "success",
          data: {
            total,
            admins,
            premium,
            verified,
            recentSignups: recent,
          },
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to fetch stats",
        });
      }
    },
  });

  // GET /api/admin/users/:id - Get user details
  app.get("/users/:id", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        const user = await app.prisma.user.findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isPremium: true,
            emailVerified: true,
            subStatus: true,
            subStartDate: true,
            nextBillingDate: true,
            createdAt: true,
            updatedAt: true,
            watchlist: {
              take: 5,
              select: { id: true, title: true, slug: true, thumbnailUrl: true },
            },
            downloadHistory: {
              take: 5,
              select: {
                id: true,
                timestamp: true,
                movie: { select: { title: true } },
              },
            },
            watchHistory: {
              take: 5,
              select: {
                id: true,
                progress: true,
                duration: true,
                movie: { select: { title: true } },
              },
            },
          },
        });

        if (!user) {
          return reply.status(404).send({
            status: "error",
            message: "User not found",
          });
        }

        return reply.send({
          status: "success",
          data: user,
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to fetch user",
        });
      }
    },
  });

  // PATCH /api/admin/users/:id - Update user (role, premium status, etc.)
  app.patch("/users/:id", {
    preHandler: [app.authenticate, app.requireAdmin],
    schema: { body: UpdateUserSchema },
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const data = request.body as z.infer<typeof UpdateUserSchema>;

        // Prevent self-demotion from admin
        if (id === request.user.userId && data.role && data.role !== "ADMIN") {
          return reply.status(400).send({
            status: "error",
            message: "Cannot demote yourself from admin",
          });
        }

        const user = await app.prisma.user.update({
          where: { id },
          data: {
            ...data,
            ...(data.isPremium === false && { subStatus: "inactive" }),
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isPremium: true,
            emailVerified: true,
            subStatus: true,
            updatedAt: true,
          },
        });

        return reply.send({
          status: "success",
          data: user,
          message: "User updated successfully",
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to update user",
        });
      }
    },
  });

  // DELETE /api/admin/users/:id - Ban/delete user
  app.delete("/users/:id", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        // Prevent self-deletion
        if (id === request.user.userId) {
          return reply.status(400).send({
            status: "error",
            message: "Cannot delete your own account",
          });
        }

        await app.prisma.user.delete({ where: { id } });

        return reply.send({
          status: "success",
          message: "User deleted successfully",
        });
      } catch (error) {
        return reply.status(500).send({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to delete user",
        });
      }
    },
  });
};
