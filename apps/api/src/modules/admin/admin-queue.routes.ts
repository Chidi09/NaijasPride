import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { Queue } from "bullmq";
import {
  torrentQueue,
  bookImportQueue,
  remoteIngestQueue,
  remoteIngestDeadLetterQueue,
} from "../../shared/services/queue.service";

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export const adminQueueRoutes = async (
  app: FastifyInstance,
  opts: FastifyPluginOptions
) => {
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== "ADMIN") {
      return reply.status(403).send({ success: false, error: "Forbidden: Admin access required" });
    }
  };

  // GET /api/admin/queues - Get all queue stats
  app.get("/queues", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (request, reply) => {
      try {
        const queues: QueueStats[] = [];

        // Get torrent queue stats
        const torrentQ = torrentQueue.get();
        if (torrentQ) {
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            torrentQ.getWaitingCount(),
            torrentQ.getActiveCount(),
            torrentQ.getCompletedCount(),
            torrentQ.getFailedCount(),
            torrentQ.getDelayedCount(),
          ]);

          queues.push({
            name: "torrent-processing",
            waiting,
            active,
            completed,
            failed,
            delayed,
            paused: await torrentQ.isPaused(),
          });
        }

        // Get book import queue stats
        const bookQ = bookImportQueue.get();
        if (bookQ) {
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            bookQ.getWaitingCount(),
            bookQ.getActiveCount(),
            bookQ.getCompletedCount(),
            bookQ.getFailedCount(),
            bookQ.getDelayedCount(),
          ]);

          queues.push({
            name: "book-import",
            waiting,
            active,
            completed,
            failed,
            delayed,
            paused: await bookQ.isPaused(),
          });
        }

        const remoteQ = remoteIngestQueue.get();
        if (remoteQ) {
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            remoteQ.getWaitingCount(),
            remoteQ.getActiveCount(),
            remoteQ.getCompletedCount(),
            remoteQ.getFailedCount(),
            remoteQ.getDelayedCount(),
          ]);

          queues.push({
            name: "remote-ingest-processing",
            waiting,
            active,
            completed,
            failed,
            delayed,
            paused: await remoteQ.isPaused(),
          });
        }

        const remoteDlq = remoteIngestDeadLetterQueue.get();
        if (remoteDlq) {
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            remoteDlq.getWaitingCount(),
            remoteDlq.getActiveCount(),
            remoteDlq.getCompletedCount(),
            remoteDlq.getFailedCount(),
            remoteDlq.getDelayedCount(),
          ]);

          queues.push({
            name: "remote-ingest-dead-letter",
            waiting,
            active,
            completed,
            failed,
            delayed,
            paused: await remoteDlq.isPaused(),
          });
        }

        return reply.send({
          success: true,
          data: queues,
          meta: {
            totalQueues: queues.length,
            hasRedis: !!torrentQ || !!bookQ || !!remoteQ || !!remoteDlq,
          },
        });
      } catch (error) {
        console.error("Queue stats error:", error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch queue statistics",
        });
      }
    },
  });

  // GET /api/admin/queues/:name/jobs - Get jobs from a specific queue
  app.get("/queues/:name/jobs", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (request, reply) => {
      try {
        const { name } = request.params as { name: string };
        const { status = "waiting", limit = "20" } = request.query as {
          status?: string;
          limit?: string;
        };

        let queue: Queue | null = null;
        if (name === "torrent-processing") {
          queue = torrentQueue.get();
        } else if (name === "book-import") {
          queue = bookImportQueue.get();
        } else if (name === "remote-ingest-processing") {
          queue = remoteIngestQueue.get();
        } else if (name === "remote-ingest-dead-letter") {
          queue = remoteIngestDeadLetterQueue.get();
        }

        if (!queue) {
          return reply.status(404).send({
            success: false,
            error: "Queue not found or Redis not configured",
          });
        }

        let jobs: any[] = [];
        const limitNum = Math.min(parseInt(limit) || 20, 100);

        switch (status) {
          case "waiting":
            jobs = await queue.getWaiting(0, limitNum);
            break;
          case "active":
            jobs = await queue.getActive(0, limitNum);
            break;
          case "completed":
            jobs = await queue.getCompleted(0, limitNum);
            break;
          case "failed":
            jobs = await queue.getFailed(0, limitNum);
            break;
          case "delayed":
            jobs = await queue.getDelayed(0, limitNum);
            break;
          default:
            jobs = await queue.getJobs(["waiting", "active", "completed", "failed", "delayed"], 0, limitNum);
        }

        const formattedJobs = jobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          progress: job.progress,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason,
          stacktrace: job.stacktrace,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
        }));

        return reply.send({
          success: true,
          data: formattedJobs,
          meta: {
            queue: name,
            status,
            count: formattedJobs.length,
          },
        });
      } catch (error) {
        console.error("Queue jobs fetch error:", error);
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch jobs",
        });
      }
    },
  });

  // POST /api/admin/queues/:name/pause - Pause a queue
  app.post("/queues/:name/pause", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (request, reply) => {
      try {
        const { name } = request.params as { name: string };

        let queue: Queue | null = null;
        if (name === "torrent-processing") {
          queue = torrentQueue.get();
        } else if (name === "book-import") {
          queue = bookImportQueue.get();
        } else if (name === "remote-ingest-processing") {
          queue = remoteIngestQueue.get();
        } else if (name === "remote-ingest-dead-letter") {
          queue = remoteIngestDeadLetterQueue.get();
        }

        if (!queue) {
          return reply.status(404).send({
            success: false,
            error: "Queue not found",
          });
        }

        await queue.pause();

        return reply.send({
          success: true,
          message: `Queue ${name} paused`,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: "Failed to pause queue",
        });
      }
    },
  });

  // POST /api/admin/queues/:name/resume - Resume a queue
  app.post("/queues/:name/resume", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (request, reply) => {
      try {
        const { name } = request.params as { name: string };

        let queue: Queue | null = null;
        if (name === "torrent-processing") {
          queue = torrentQueue.get();
        } else if (name === "book-import") {
          queue = bookImportQueue.get();
        } else if (name === "remote-ingest-processing") {
          queue = remoteIngestQueue.get();
        } else if (name === "remote-ingest-dead-letter") {
          queue = remoteIngestDeadLetterQueue.get();
        }

        if (!queue) {
          return reply.status(404).send({
            success: false,
            error: "Queue not found",
          });
        }

        await queue.resume();

        return reply.send({
          success: true,
          message: `Queue ${name} resumed`,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: "Failed to resume queue",
        });
      }
    },
  });

  // DELETE /api/admin/queues/:name/jobs/:jobId - Remove a specific job
  app.delete("/queues/:name/jobs/:jobId", {
    preHandler: [app.authenticate, requireAdmin],
    handler: async (request, reply) => {
      try {
        const { name, jobId } = request.params as { name: string; jobId: string };

        let queue: Queue | null = null;
        if (name === "torrent-processing") {
          queue = torrentQueue.get();
        } else if (name === "book-import") {
          queue = bookImportQueue.get();
        } else if (name === "remote-ingest-processing") {
          queue = remoteIngestQueue.get();
        } else if (name === "remote-ingest-dead-letter") {
          queue = remoteIngestDeadLetterQueue.get();
        }

        if (!queue) {
          return reply.status(404).send({
            success: false,
            error: "Queue not found",
          });
        }

        const job = await queue.getJob(jobId);
        if (!job) {
          return reply.status(404).send({
            success: false,
            error: "Job not found",
          });
        }

        await job.remove();

        return reply.send({
          success: true,
          message: `Job ${jobId} removed`,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: "Failed to remove job",
        });
      }
    },
  });
};
