import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from "fastify";
import { Queue, Job } from "bullmq";
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
import { NotFoundError } from "../../shared/errors/app-error";

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
    handler: async (request) => {
      const queues: QueueStats[] = [];

      // Get torrent queue stats
      const torrentQ = torrentQueue.get();
      if (torrentQ) {
        const [waiting, active, completed, failed, delayed] = await Promise.all(
          [
            torrentQ.getWaitingCount(),
            torrentQ.getActiveCount(),
            torrentQ.getCompletedCount(),
            torrentQ.getFailedCount(),
            torrentQ.getDelayedCount(),
          ],
        );

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
        const [waiting, active, completed, failed, delayed] = await Promise.all(
          [
            bookQ.getWaitingCount(),
            bookQ.getActiveCount(),
            bookQ.getCompletedCount(),
            bookQ.getFailedCount(),
            bookQ.getDelayedCount(),
          ],
        );

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
        const [waiting, active, completed, failed, delayed] = await Promise.all(
          [
            bookCoverQ.getWaitingCount(),
            bookCoverQ.getActiveCount(),
            bookCoverQ.getCompletedCount(),
            bookCoverQ.getFailedCount(),
            bookCoverQ.getDelayedCount(),
          ],
        );

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
        const [waiting, active, completed, failed, delayed] = await Promise.all(
          [
            remoteQ.getWaitingCount(),
            remoteQ.getActiveCount(),
            remoteQ.getCompletedCount(),
            remoteQ.getFailedCount(),
            remoteQ.getDelayedCount(),
          ],
        );

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
        const [waiting, active, completed, failed, delayed] = await Promise.all(
          [
            remoteDlq.getWaitingCount(),
            remoteDlq.getActiveCount(),
            remoteDlq.getCompletedCount(),
            remoteDlq.getFailedCount(),
            remoteDlq.getDelayedCount(),
          ],
        );

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

      return {
        success: true,
        data: queues,
        meta: {
          totalQueues: queues.length,
          hasRedis:
            !!torrentQ || !!bookQ || !!bookCoverQ || !!remoteQ || !!remoteDlq,
        },
      };
    },
  });

  // GET /api/admin/queues/:name/jobs - Get jobs from a specific queue
  app.get("/queues/:name/jobs", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request) => {
      const { name } = request.params as { name: string };
      const { status = "waiting", limit = "20" } = request.query as {
        status?: string;
        limit?: string;
      };

      const queue = resolveQueue(name);
      if (!queue) {
        throw new NotFoundError("Queue not found or Redis not configured");
      }

      let jobs: Job[] = [];
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

      return {
        success: true,
        data: formattedJobs,
        meta: {
          queue: name,
          status,
          count: formattedJobs.length,
        },
      };
    },
  });

  // POST /api/admin/queues/:name/pause - Pause a queue
  app.post("/queues/:name/pause", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request) => {
      const { name } = request.params as { name: string };

      const queue = resolveQueue(name);
      if (!queue) {
        throw new NotFoundError("Queue");
      }

      await queue.pause();

      return {
        success: true,
        message: `Queue ${name} paused`,
      };
    },
  });

  // POST /api/admin/queues/:name/resume - Resume a queue
  app.post("/queues/:name/resume", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request) => {
      const { name } = request.params as { name: string };

      const queue = resolveQueue(name);
      if (!queue) {
        throw new NotFoundError("Queue");
      }

      await queue.resume();

      return {
        success: true,
        message: `Queue ${name} resumed`,
      };
    },
  });

  // DELETE /api/admin/queues/:name/jobs/:jobId - Remove a specific job
  app.delete("/queues/:name/jobs/:jobId", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request) => {
      const { name, jobId } = request.params as {
        name: string;
        jobId: string;
      };

      const queue = resolveQueue(name);
      if (!queue) {
        throw new NotFoundError("Queue");
      }

      const job = await queue.getJob(jobId);
      if (!job) {
        throw new NotFoundError("Job");
      }

      await job.remove();

      return {
        success: true,
        message: `Job ${jobId} removed`,
      };
    },
  });

  // GET /api/admin/health/external-services - Check health of external services
  app.get("/health/external-services", {
    preHandler: [app.authenticate, app.requireAdmin],
    handler: async (request) => {
      const results: {
        elsci?: unknown;
        "1337x"?: {
          mirrors: Array<{
            url: string;
            healthy: boolean;
            responseTimeMs?: number;
            error?: string;
          }>;
        };
        flaresolverr?: {
          healthy: boolean;
          responseTimeMs: number;
          version?: string;
          sessions?: unknown;
          error?: string;
        };
      } = {};

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

      return {
        success: true,
        timestamp: new Date().toISOString(),
        services: results,
      };
    },
  });
};
