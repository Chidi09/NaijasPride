import { PrismaClient, NotificationType } from "@prisma/client";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "../../shared/errors/app-error";

export class CommentsService {
  constructor(private readonly prisma: PrismaClient) {}

  async listComments(params: {
    movieId?: string;
    showId?: string;
    page: number;
    limit: number;
  }) {
    const { movieId, showId, page, limit } = params;
    if (!movieId && !showId)
      throw new BadRequestError("movieId or showId required");

    const where = movieId
      ? { movieId, parentId: null }
      : { showId, parentId: null };
    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { replies: true } },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);

    return {
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        replyCount: c._count.replies,
        user: {
          id: c.user.id,
          name: c.user.name || c.user.email.split("@")[0],
        },
      })),
      total,
    };
  }

  async listReplies(commentId: string) {
    const replies = await this.prisma.comment.findMany({
      where: { parentId: commentId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return replies.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      user: { id: r.user.id, name: r.user.name || r.user.email.split("@")[0] },
    }));
  }

  async createComment(params: {
    userId: string;
    body: string;
    movieId?: string;
    showId?: string;
    parentId?: string;
  }) {
    const { userId, body, movieId, showId, parentId } = params;
    if (!movieId && !showId)
      throw new BadRequestError("movieId or showId required");

    if (parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: parentId },
      });
      if (!parent) throw new NotFoundError("Parent comment");
    }

    const comment = await this.prisma.comment.create({
      data: { userId, movieId, showId, parentId, body },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return comment;
  }

  async deleteComment(commentId: string, userId: string, isAdmin: boolean) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundError("Comment");
    if (comment.userId !== userId && !isAdmin) {
      throw new ForbiddenError();
    }

    await this.prisma.comment.delete({ where: { id: commentId } });
    return true;
  }

  async notifyAfterComment(comment: {
    id: string;
    userId: string;
    parentId: string | null;
    body: string;
    movieId: string | null;
    showId: string | null;
  }) {
    const notifications: Array<{
      userId: string;
      type: NotificationType;
      title: string;
      body: string;
      data: any;
    }> = [];

    // 1. Notify parent comment author on reply
    if (comment.parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: comment.parentId },
        select: { userId: true },
      });
      if (parent && parent.userId !== comment.userId) {
        notifications.push({
          userId: parent.userId,
          type: NotificationType.COMMENT_REPLY,
          title: "New reply to your comment",
          body: comment.body.slice(0, 100),
          data: {
            commentId: comment.id,
            movieId: comment.movieId,
            showId: comment.showId,
          },
        });
      }
    }

    // 2. Parse @mentions and notify mentioned users
    const mentions = [...comment.body.matchAll(/@(\w+)/g)].map((m) => m[1]);
    if (mentions.length) {
      const users = await this.prisma.user.findMany({
        where: { name: { in: mentions } },
        select: { id: true },
      });
      for (const u of users) {
        if (u.id !== comment.userId) {
          notifications.push({
            userId: u.id,
            type: NotificationType.COMMENT_MENTION,
            title: "You were mentioned in a comment",
            body: comment.body.slice(0, 100),
            data: {
              commentId: comment.id,
              movieId: comment.movieId,
              showId: comment.showId,
            },
          });
        }
      }
    }

    if (notifications.length) {
      await this.prisma.notification.createMany({
        data: notifications,
        skipDuplicates: true,
      });
    }
  }
}
