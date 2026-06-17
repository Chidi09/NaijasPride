/**
 * Elsci Mirror Worker
 *
 * BullMQ worker that processes elsci-mirror jobs. Each job runs the
 * mirror harvester which solves Cloudflare via FlareSolverr and then
 * batch-downloads unmirrored Elsci light novel files to R2.
 */

import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import {
  runElsciMirrorHarvester,
  type MirrorOptions,
} from "../modules/books/external/elsci/elsci-mirror-harvester";

type ElsciMirrorJobData = {
  batchSize?: number;
  maxReAuthAttempts?: number;
  perFileTimeoutMs?: number;
  maxFileSizeBytes?: number;
  delayBetweenDownloadsMs?: number;
  dryRun?: boolean;
  triggeredBy?: string;
  timestamp?: number;
};

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error("[ElsciMirrorWorker] REDIS_URL is not set. Exiting.");
  process.exit(1);
}

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient();

const worker = new Worker(
  "elsci-mirror",
  async (job) => {
    const data = (job.data || {}) as ElsciMirrorJobData;

    console.log(
      `[ElsciMirrorWorker] Job ${job.id} started (batch=${data.batchSize || 20}, dryRun=${!!data.dryRun})`,
    );

    const options: MirrorOptions = {
      batchSize: data.batchSize,
      maxReAuthAttempts: data.maxReAuthAttempts,
      perFileTimeoutMs: data.perFileTimeoutMs,
      maxFileSizeBytes: data.maxFileSizeBytes,
      delayBetweenDownloadsMs: data.delayBetweenDownloadsMs,
      dryRun: data.dryRun,
    };

    const result = await runElsciMirrorHarvester(prisma, options);

    console.log(
      `[ElsciMirrorWorker] Job ${job.id} finished: ` +
        `${result.mirrored} mirrored, ${result.failed} failed, ${result.skipped} skipped`,
    );

    return result;
  },
  {
    connection,
    concurrency: 1, // Only one mirror job at a time
    limiter: {
      max: 1,
      duration: 60_000, // Max 1 job per minute
    },
  },
);

worker.on("completed", (job) => {
  console.log(`[ElsciMirrorWorker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[ElsciMirrorWorker] Job ${job?.id} failed: ${err.message}`);
});

const shutdown = async () => {
  try {
    await worker.close();
  } catch {
    // ignore
  }
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  try {
    await connection.quit();
  } catch {
    // ignore
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
