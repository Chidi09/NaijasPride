import { FastifyInstance } from 'fastify';
import { WrappedService } from './wrapped.service';
import { getPushService } from '../../shared/services/push-notification.service';

/**
 * Wrapped Cron Scheduler
 * 
 * - Monthly: 1st of each month, generates previous month's wrapped for all active users
 * - Annual: December 1st, generates annual wrapped for all active users
 * - Also sends push notifications when wrapped is ready
 */

export class WrappedCronService {
  private wrappedService: WrappedService;
  private monthlyTimer: NodeJS.Timeout | null = null;
  private annualTimer: NodeJS.Timeout | null = null;

  constructor(private readonly app: FastifyInstance) {
    this.wrappedService = new WrappedService(app.prisma);
  }

  start(): void {
    this.scheduleMonthlyJob();
    this.scheduleAnnualJob();
    
    this.app.log.info('[WrappedCron] Started - Monthly (1st) and Annual (Dec 1st) jobs scheduled');
  }

  stop(): void {
    if (this.monthlyTimer) clearTimeout(this.monthlyTimer);
    if (this.annualTimer) clearTimeout(this.annualTimer);
  }

  // Max safe setTimeout delay (32-bit signed int limit ≈ 24.8 days)
  private readonly MAX_TIMEOUT_MS = 2147483647;

  private scheduleMonthlyJob(): void {
    const nextRun = this.getNextMonthlyRun();
    const delay = nextRun.getTime() - Date.now();

    // Cap delay at max safe timeout to avoid overflow
    const safeDelay = Math.min(delay, this.MAX_TIMEOUT_MS);
    const isCapped = safeDelay < delay;

    this.app.log.info(`[WrappedCron] Monthly job scheduled for ${nextRun.toISOString()}${isCapped ? ' (rechecking in chunks until then)' : ''}`);

    this.monthlyTimer = setTimeout(() => {
      if (isCapped) {
        // Still not time yet, reschedule
        this.scheduleMonthlyJob();
      } else {
        this.runMonthlyJob();
        // Reschedule for next month
        this.scheduleMonthlyJob();
      }
    }, safeDelay);
  }

  private scheduleAnnualJob(): void {
    const nextRun = this.getNextAnnualRun();
    const delay = nextRun.getTime() - Date.now();

    // Cap delay at max safe timeout to avoid overflow
    const safeDelay = Math.min(delay, this.MAX_TIMEOUT_MS);
    const isCapped = safeDelay < delay;

    this.app.log.info(`[WrappedCron] Annual job scheduled for ${nextRun.toISOString()}${isCapped ? ' (rechecking in chunks until then)' : ''}`);

    this.annualTimer = setTimeout(() => {
      if (isCapped) {
        // Still not time yet, reschedule
        this.scheduleAnnualJob();
      } else {
        this.runAnnualJob();
        // Reschedule for next year
        this.scheduleAnnualJob();
      }
    }, safeDelay);
  }

  private getNextMonthlyRun(): Date {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 6, 0, 0); // 6 AM UTC on 1st
    return next;
  }

  private getNextAnnualRun(): Date {
    const now = new Date();
    const currentYear = now.getFullYear();
    const thisDec1 = new Date(currentYear, 11, 1, 8, 0, 0); // Dec 1st, 8 AM UTC

    if (now < thisDec1) {
      return thisDec1;
    }
    return new Date(currentYear + 1, 11, 1, 8, 0, 0);
  }

  private async runMonthlyJob(): Promise<void> {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    
    this.app.log.info(`[WrappedCron] Starting monthly job for period: ${period}`);

    try {
      // Generate wrapped for all active users (batch in chunks)
      let offset = 0;
      const limit = 500;
      let totalProcessed = 0;

      while (true) {
        const result = await this.wrappedService.generateForAllUsers(period, { limit, offset });
        totalProcessed += result.processed;
        
        if (result.processed === 0) break;
        offset += limit;

        // Small delay between batches to avoid overwhelming the system
        await new Promise(r => setTimeout(r, 1000));
      }

      this.app.log.info(`[WrappedCron] Monthly job completed: ${totalProcessed} users processed for ${period}`);

      // Send push notifications
      await this.sendMonthlyNotifications(period);

    } catch (error) {
      this.app.log.error({ error }, '[WrappedCron] Monthly job failed');
    }
  }

  private async runAnnualJob(): Promise<void> {
    const year = new Date().getFullYear();
    const period = `${year}-annual`;
    
    this.app.log.info(`[WrappedCron] Starting annual job for ${year}`);

    try {
      // Generate annual wrapped for all active users
      let offset = 0;
      const limit = 500;
      let totalProcessed = 0;

      while (true) {
        const result = await this.wrappedService.generateForAllUsers(period, { limit, offset });
        totalProcessed += result.processed;
        
        if (result.processed === 0) break;
        offset += limit;

        await new Promise(r => setTimeout(r, 1000));
      }

      this.app.log.info(`[WrappedCron] Annual job completed: ${totalProcessed} users processed for ${period}`);

      // Send push notifications (more exciting for annual)
      await this.sendAnnualNotifications(year);

    } catch (error) {
      this.app.log.error({ error }, '[WrappedCron] Annual job failed');
    }
  }

  private async sendMonthlyNotifications(period: string): Promise<void> {
    const pushService = getPushService(this.app.prisma);
    if (!pushService) return;

    // Get all users who have wrapped for this period
    const wrappedRecords = await this.app.prisma.userWrappedStats.findMany({
      where: { period },
      select: { userId: true },
    });

    const monthName = new Date(`${period}-01`).toLocaleString('en-NG', { month: 'long' });

    for (const record of wrappedRecords) {
      try {
        await pushService.sendGeneric(
          record.userId,
          `Your ${monthName} Wrapped is here! 🎬`,
          'See your top movies, music, and books from this month',
          `/wrapped/${period}`,
          { event: 'monthly_wrapped', period }
        );
      } catch (error) {
        this.app.log.error({ error, userId: record.userId }, '[WrappedCron] Failed to send monthly notification');
      }
    }

    this.app.log.info(`[WrappedCron] Sent ${wrappedRecords.length} monthly notifications`);
  }

  private async sendAnnualNotifications(year: number): Promise<void> {
    const pushService = getPushService(this.app.prisma);
    if (!pushService) return;

    const period = `${year}-annual`;

    const wrappedRecords = await this.app.prisma.userWrappedStats.findMany({
      where: { period },
      select: { userId: true },
    });

    for (const record of wrappedRecords) {
      try {
        await pushService.sendGeneric(
          record.userId,
          `Your ${year} Wrapped has arrived! 🎉`,
          'Your year in entertainment is ready. Discover your top movies, music, and more!',
          `/wrapped/${period}`,
          { event: 'annual_wrapped', period }
        );
      } catch (error) {
        this.app.log.error({ error, userId: record.userId }, '[WrappedCron] Failed to send annual notification');
      }
    }

    this.app.log.info(`[WrappedCron] Sent ${wrappedRecords.length} annual notifications`);
  }
}
