/**
 * NewChapterService
 *
 * Periodically polls manga sources for new chapters on behalf of all users
 * who have subscribed via /api/v1/library/manga/chapter-watch.
 *
 * How it works:
 *  1. Every N minutes (default 60), load all MangaNewChapterCheck rows
 *  2. Group by (source, mangaId) to de-duplicate — many users may follow the same manga
 *  3. For each unique manga, fetch the latest chapter list from the source
 *  4. Compare against the stored lastSeenChapterId for each subscribed user
 *  5. For any user whose lastSeenChapterId is behind the latest chapter:
 *       a. Send an FCM push notification
 *       b. Update lastSeenChapterId + lastSeenAt in the DB
 *
 * Resilience:
 *  - One manga per source is fetched at a time with a short delay between calls
 *    to avoid hammering source servers.
 *  - Each manga fetch is wrapped in try/catch; one failure does not stop the run.
 *  - The service is a no-op if no users have chapter watches registered.
 */

import { PrismaClient } from '@prisma/client';
import { getPushService } from '../../shared/services/push-notification.service';
import { MangaSourceManager } from './sources/source-manager';
import type { MangaChapter } from './sources/types';

const INTER_FETCH_DELAY_MS = 1_500; // delay between each manga source fetch to be polite
const MAX_CHAPTERS_FETCHED = 10;    // we only need the most recent chapters
const PG_ADVISORY_LOCK_KEY = 8_106_242; // shared lock key across API instances

const sourceIdFromEntityId = (entityId: string): string | null => {
  const separator = entityId.indexOf(':');
  if (separator <= 0) return null;
  return entityId.slice(0, separator);
};

export class NewChapterService {
  constructor(
    private prisma: PrismaClient,
    private sourceManager: MangaSourceManager,
  ) {}

  private async acquireDistributedLock(): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_lock(${PG_ADVISORY_LOCK_KEY}) AS acquired
      `;
      return !!rows[0]?.acquired;
    } catch {
      // Non-Postgres or lock unavailable: continue without distributed lock.
      return true;
    }
  }

  private async releaseDistributedLock(): Promise<void> {
    try {
      await this.prisma.$queryRaw`
        SELECT pg_advisory_unlock(${PG_ADVISORY_LOCK_KEY})
      `;
    } catch {
      // Ignore unlock errors.
    }
  }

  /**
   * Run the full check cycle.
   * Called from a setInterval in app.ts (every CHECK_INTERVAL_MS).
   */
  async runCheck(): Promise<void> {
    const startedAt = Date.now();
    const lockAcquired = await this.acquireDistributedLock();
    if (!lockAcquired) {
      console.log('[NewChapterService] Skipping run — another instance holds lock');
      return;
    }

    try {
    const watches = await this.prisma.mangaNewChapterCheck.findMany({
      select: {
        id: true,
        userId: true,
        mangaId: true,
        mangaTitle: true,
        mangaCoverUrl: true,
        lastSeenChapterId: true,
        lastSeenAt: true,
      },
    });

    if (watches.length === 0) return;

    // De-duplicate: only fetch each unique mangaId once
    const uniqueMangaIds = [...new Set(watches.map(w => w.mangaId))];
    console.log(`[NewChapterService] Checking ${uniqueMangaIds.length} manga for ${watches.length} subscriptions`);

    // Map mangaId → latest chapters array (fetched once, reused for all users)
    const latestChaptersMap = new Map<string, MangaChapter[]>();
    let fetchFailures = 0;

    for (const mangaId of uniqueMangaIds) {
      try {
        const sourceId = sourceIdFromEntityId(mangaId);
        if (!sourceId) {
          fetchFailures += 1;
          continue;
        }

        const chapters = await this.sourceManager.getChaptersBySource(
          sourceId,
          mangaId,
          undefined,
          MAX_CHAPTERS_FETCHED,
        );
        latestChaptersMap.set(mangaId, chapters);
      } catch (err) {
        fetchFailures += 1;
        console.warn(`[NewChapterService] Failed to fetch chapters for ${mangaId}:`, err);
      }
      // Polite delay between source fetches
      await new Promise(r => setTimeout(r, INTER_FETCH_DELAY_MS));
    }

    // Now process per-user subscriptions
    const push = getPushService(this.prisma);
    const now = new Date();
    let notificationsSent = 0;
    let recordsUpdated = 0;

    for (const watch of watches) {
      const chapters = latestChaptersMap.get(watch.mangaId);
      if (!chapters || chapters.length === 0) continue;

      // Chapters are returned newest-first
      const latestChapter = chapters[0];
      if (!latestChapter) continue;

      // Skip if user has already seen this chapter
      if (watch.lastSeenChapterId === latestChapter.id) continue;

      // If user has no lastSeenChapterId (new subscription), just record the current latest
      // without spamming them with a notification for the very first check
      if (!watch.lastSeenChapterId) {
        await this.prisma.mangaNewChapterCheck.update({
          where: { id: watch.id },
          data: { lastSeenChapterId: latestChapter.id, lastSeenAt: now },
        });
        recordsUpdated += 1;
        continue;
      }

      // New chapter found — send push notification
      const chapterLabel = latestChapter.title
        ? `Chapter ${latestChapter.chapter}: ${latestChapter.title}`
        : `Chapter ${latestChapter.chapter}`;

      push.sendNewMangaChapter(
        watch.userId,
        watch.mangaTitle,
        watch.mangaId,
        chapterLabel,
        watch.mangaCoverUrl ?? undefined,
      ).catch(console.error);
      notificationsSent += 1;

      // Update the record
      await this.prisma.mangaNewChapterCheck.update({
        where: { id: watch.id },
        data: {
          lastSeenChapterId: latestChapter.id,
          lastSeenAt: latestChapter.publishedAt ? new Date(latestChapter.publishedAt) : now,
        },
      });
      recordsUpdated += 1;
    }

    console.log(
      `[NewChapterService] Check complete: subscriptions=${watches.length}, uniqueManga=${uniqueMangaIds.length}, fetchFailures=${fetchFailures}, notifications=${notificationsSent}, updates=${recordsUpdated}, durationMs=${Date.now() - startedAt}`,
    );
    } finally {
      await this.releaseDistributedLock();
    }
  }
}
