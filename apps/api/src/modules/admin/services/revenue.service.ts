import { PrismaClient } from "@prisma/client";
import {
  subDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
} from "date-fns";

export class RevenueService {
  constructor(private prisma: PrismaClient) {}

  async getRevenueSummary() {
    const now = new Date();

    const [totalSubscriptionRevenue, totalAdRevenue] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { status: "success" },
        _sum: { amount: true },
      }),
      this.prisma.adRevenueRecord.aggregate({
        _sum: { revenue: true },
      }),
    ]);

    return {
      subscriptions: (totalSubscriptionRevenue._sum.amount || 0) / 100, // Convert kobo to Naira
      ads: totalAdRevenue._sum.revenue || 0,
      total:
        (totalSubscriptionRevenue._sum.amount || 0) / 100 +
        (totalAdRevenue._sum.revenue || 0),
    };
  }

  async getRevenueBreakdown(period: "weekly" | "monthly" | "yearly") {
    const now = new Date();
    let startDate: Date;
    let groupings: { date: Date; amount: number; adRevenue: number }[] = [];

    if (period === "weekly") {
      startDate = startOfWeek(subDays(now, 28)); // Last 4 weeks
    } else if (period === "monthly") {
      startDate = startOfMonth(subDays(now, 365)); // Last 12 months
    } else {
      startDate = startOfYear(subDays(now, 365 * 2)); // Last 3 years
    }

    // Since Prisma doesn't have native GROUP BY DATE_TRUNC in a cross-database way easily,
    // and we are using Postgres, we can use raw query or fetch and process in JS for smaller datasets.
    // For large datasets, Raw SQL is better. We'll use raw SQL since we are on Postgres.

    const transactionData: Array<{
      period: Date;
      total_amount: number | bigint;
    }> = await this.prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${period === "weekly" ? "week" : period === "monthly" ? "month" : "year"}, "createdAt") as period,
        SUM(amount) as total_amount
      FROM "Transaction"
      WHERE status = 'success' AND "createdAt" >= ${startDate}
      GROUP BY period
      ORDER BY period ASC
    `;

    const adRevenueData: Array<{
      period: Date;
      total_revenue: number | bigint;
    }> = await this.prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${period === "weekly" ? "week" : period === "monthly" ? "month" : "year"}, "date") as period,
        SUM(revenue) as total_revenue
      FROM "AdRevenueRecord"
      WHERE "date" >= ${startDate}
      GROUP BY period
      ORDER BY period ASC
    `;

    // Merge the data
    const map = new Map<
      string,
      { period: string; subscription: number; ads: number }
    >();

    transactionData.forEach((d) => {
      const key = d.period.toISOString();
      map.set(key, {
        period: key,
        subscription: Number(d.total_amount) / 100,
        ads: 0,
      });
    });

    adRevenueData.forEach((d) => {
      const key = d.period.toISOString();
      const existing = map.get(key) || { period: key, subscription: 0, ads: 0 };
      existing.ads = Number(d.total_revenue);
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.period.localeCompare(b.period),
    );
  }

  /**
   * Manual entry for Ad Revenue (Admin usually checks Adsterra dashboard and enters daily amount)
   */
  async recordAdRevenue(
    date: Date,
    revenue: number,
    impressions: number = 0,
    clicks: number = 0,
  ) {
    const d = startOfDay(date);
    return this.prisma.adRevenueRecord.upsert({
      where: { date: d },
      update: { revenue, impressions, clicks },
      create: { date: d, revenue, impressions, clicks },
    });
  }
}
