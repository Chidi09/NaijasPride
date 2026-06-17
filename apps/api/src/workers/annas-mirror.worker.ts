/**
 * Anna's Archive Mirror Worker
 *
 * BullMQ worker that processes annas-mirror jobs. Each job runs the
 * Anna's Archive mirror harvester which uses Playwright to download
 * book files and upload them to R2 storage.
 */

import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import {
  runAnnasMirrorHarvester,
  type AnnasMirrorOptions,
} from "../modules/books/external/annas-archive/annas-mirror-harvester";

type AnnasMirrorJobData = {
  batchSize?: number;
  perFileTimeoutMs?: number;
  maxFileSizeBytes?: number;
  delayBetweenDownloadsMs?: number;
  dryRun?: boolean;
  triggeredBy?: string;
  timestamp?: number;
};

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error("[AnnasMirrorWorker] REDIS_URL is not set. Exiting.");
  process.exit(1);
}

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const prisma = new PrismaClient();

const worker = new Worker(
  "annas-mirror",
  async (job) => {
    const data = (job.data || {}) as AnnasMirrorJobData;

    console.log(
      `[AnnasMirrorWorker] Job ${job.id} started (batch=${data.batchSize || 10}, dryRun=${!!data.dryRun})`,
    );

    const options: AnnasMirrorOptions = {
      batchSize: data.batchSize,
      perFileTimeoutMs: data.perFileTimeoutMs,
      maxFileSizeBytes: data.maxFileSizeBytes,
      delayBetweenDownloadsMs: data.delayBetweenDownloadsMs,
      dryRun: data.dryRun,
    };

    const result = await runAnnasMirrorHarvester(prisma, options);

    console.log(
      `[AnnasMirrorWorker] Job ${job.id} finished: ` +
        `${result.mirrored} mirrored, ${result.failed} failed, ${result.skipped} skipped`,
    );

    return result;
  },
  {
    connection,
    concurrency: 1,
    limiter: {
      max: 1,
      duration: 120_000, // Max 1 job per 2 minutes (Anna's rate limits are stricter)
    },
  },
);

worker.on("completed", (job) => {
  console.log(`[AnnasMirrorWorker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[AnnasMirrorWorker] Job ${job?.id} failed: ${err.message}`);
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
