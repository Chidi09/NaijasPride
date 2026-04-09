import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { Queue } from "bullmq";
import axios from "axios";
import {
  torrentQueue,
  bookImportQueue,
  bookCoverQueue,
  remoteIngestQueue,
  remoteIngestDeadLetterQueue,
} from "../../shared/services/queue.service";
import { checkElsciHealth } from "../books/external/elsci/elsci-lightnovels";
import { HealthMonitorService } from "../../shared/services/health-monitor.service";

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

/**
 * Resolve a queue by its name. Returns null if queue name is unknown or not configured.
 */
function resolveQueue(name: string): Queue | null {
  if (name === "torrent-processing") return torrentQueue.get();
  if (name === "book-import") return bookImportQueue.get();
  if (name === "book-cover-processing") return bookCoverQueue.get();
  if (name === "remote-ingest-processing") return remoteIngestQueue.get();
  if (name === "remote-ingest-dead-letter")
    return remoteIngestDeadLetterQueue.get();
  return null;
}

export const adminQueueRoutes = async (
  app: FastifyInstance,
  opts: FastifyPluginOptions,
) => {
  // GET /api/admin/queues - Get all queue stats
  app.get("/queues", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request, reply) => {
      try {
        const queues: QueueStats[] = [];

        // Get torrent queue stats
        const torrentQ = torrentQueue.get();
        if (torrentQ) {
          const [waiting, active, completed, failed, delayed] =
            await Promise.all([
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
          const [waiting, active, completed, failed, delayed] =
            await Promise.all([
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

        const bookCoverQ = bookCoverQueue.get();
        if (bookCoverQ) {
          const [waiting, active, completed, failed, delayed] =
            await Promise.all([
              bookCoverQ.getWaitingCount(),
              bookCoverQ.getActiveCount(),
              bookCoverQ.getCompletedCount(),
              bookCoverQ.getFailedCount(),
              bookCoverQ.getDelayedCount(),
            ]);

          queues.push({
            name: "book-cover-processing",
            waiting,
            active,
            completed,
            failed,
            delayed,
            paused: await bookCoverQ.isPaused(),
          });
        }

        const remoteQ = remoteIngestQueue.get();
        if (remoteQ) {
          const [waiting, active, completed, failed, delayed] =
            await Promise.all([
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
          const [waiting, active, completed, failed, delayed] =
            await Promise.all([
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
            hasRedis:
              !!torrentQ || !!bookQ || !!bookCoverQ || !!remoteQ || !!remoteDlq,
          },
        });
      } catch (error) {
        app.log.error({ error }, "Queue stats error");
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch queue statistics",
        });
      }
    },
  });

  // GET /api/admin/queues/:name/jobs - Get jobs from a specific queue
  app.get("/queues/:name/jobs", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request, reply) => {
      try {
        const { name } = request.params as { name: string };
        const { status = "waiting", limit = "20" } = request.query as {
          status?: string;
          limit?: string;
        };

        const queue = resolveQueue(name);
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
            jobs = await queue.getJobs(
              ["waiting", "active", "completed", "failed", "delayed"],
              0,
              limitNum,
            );
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
        app.log.error({ error }, "Queue jobs fetch error");
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch jobs",
        });
      }
    },
  });

  // POST /api/admin/queues/:name/pause - Pause a queue
  app.post("/queues/:name/pause", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request, reply) => {
      try {
        const { name } = request.params as { name: string };

        const queue = resolveQueue(name);
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
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request, reply) => {
      try {
        const { name } = request.params as { name: string };

        const queue = resolveQueue(name);
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
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request, reply) => {
      try {
        const { name, jobId } = request.params as {
          name: string;
          jobId: string;
        };

        const queue = resolveQueue(name);
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

  // GET /api/admin/health/external-services - Check health of external services
  app.get("/health/external-services", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request, reply) => {
      try {
        const results: Record<string, any> = {};

        // Check Elsci health
        const elsciHealth = await checkElsciHealth();
        results.elsci = elsciHealth;

        // Check 1337x health (basic connectivity test)
        const mirrorUrls = [
          "https://www.1377x.to",
          "https://1337x.st",
          "https://x1337x.ws",
        ];

        results["1337x"] = {
          mirrors: [] as Array<{
            url: string;
            healthy: boolean;
            responseTimeMs?: number;
            error?: string;
          }>,
        };

        for (const url of mirrorUrls.slice(0, 3)) {
          const startTime = Date.now();
          try {
            const response = await axios.get(url, {
              timeout: 10000,
              validateStatus: () => true,
            });
            results["1337x"].mirrors.push({
              url,
              healthy: response.status >= 200 && response.status < 400,
              responseTimeMs: Date.now() - startTime,
            });
          } catch (error) {
            results["1337x"].mirrors.push({
              url,
              healthy: false,
              responseTimeMs: Date.now() - startTime,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Check FlareSolverr status — must use POST /v1 (GET returns 405)
        const flaresolverrUrl = (
          process.env.FLARESOLVERR_URL || "http://flaresolverr:8191"
        ).trim();
        const startTime = Date.now();
        try {
          const response = await axios.post(
            `${flaresolverrUrl}/v1`,
            { cmd: "sessions.list" },
            { timeout: 8000, validateStatus: () => true },
          );
          const ok =
            response.status >= 200 &&
            response.status < 300 &&
            response.data?.status === "ok";
          results.flaresolverr = {
            healthy: ok,
            responseTimeMs: Date.now() - startTime,
            version: response.data?.version,
            sessions: response.data?.sessions,
          };
        } catch (error) {
          results.flaresolverr = {
            healthy: false,
            responseTimeMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
          };
        }

        return reply.send({
          success: true,
          timestamp: new Date().toISOString(),
          services: results,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: "Failed to check external service health",
        });
      }
    },
  });
};
