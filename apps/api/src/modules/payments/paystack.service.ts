import axios from 'axios';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { emailService } from '../../shared/services/email.service';
import { getPushService } from '../../shared/services/push-notification.service';
import { getRedis } from '../../shared/services/redis.service';

const getPaystackSecret = () => {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('PAYSTACK_SECRET_KEY environment variable is required');
  return key;
};

// Thrown for errors that Paystack should NOT retry (bad data, unknown user, etc.)
export class NonRetryablePaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryablePaymentError';
  }
}

export class PaystackService {
  constructor(private prisma: PrismaClient) {}

  // Fix #3: plan resolution lives here, not in the route
  async resolvePlanBySlug(slug: string): Promise<{
    amountKobo: number;
    durationDays: number;
    planName: string;
    planId?: string;
  }> {
    const dbPlan = await this.prisma.plan.findUnique({ where: { slug } });
    if (dbPlan) {
      return {
        amountKobo: dbPlan.price * 100, // price stored in Naira, Paystack needs kobo
        durationDays: dbPlan.durationDays,
        planName: dbPlan.name,
        planId: dbPlan.id,
      };
    }
    // Legacy fallback: monthly = ₦1,500, yearly = ₦12,000
    return {
      amountKobo: slug === 'yearly' ? 1_200_000 : 150_000,
      durationDays: slug === 'yearly' ? 365 : 30,
      planName: slug === 'yearly' ? 'Yearly Plan' : 'Monthly Plan',
    };
  }

  async initializeTransaction(
    user: { id: string; email: string },
    amountKobo: number,
    opts?: { planSlug?: string; planId?: string; planName?: string; durationDays?: number }
  ) {
    const paystackEmail = this.toPaystackCustomerEmail(user);

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: paystackEmail,
        amount: amountKobo,
        callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
        metadata: {
          userId: user.id,
          originalEmail: user.email,
          planSlug: opts?.planSlug ?? null,
          planId: opts?.planId ?? null,
          planName: opts?.planName ?? null,
          durationDays: opts?.durationDays ?? null,
          // custom_fields is for Paystack's dashboard display only — not parsed on read
          custom_fields: [
            { display_name: 'Payment Type', variable_name: 'payment_type', value: 'subscription' },
            { display_name: 'User ID', variable_name: 'user_id', value: user.id },
            { display_name: 'Plan', variable_name: 'plan_name', value: opts?.planName || '' },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${getPaystackSecret()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data;
  }

  // Fix #2: accepts raw Buffer so HMAC is computed over the exact bytes Paystack sent
  verifyWebhookSignature(signature: string, rawBody: Buffer | string): boolean {
    const hash = crypto
      .createHmac('sha512', getPaystackSecret())
      .update(rawBody)
      .digest('hex');
    try {
      const left = Buffer.from(hash, 'hex');
      const right = Buffer.from(signature, 'hex');
      if (left.length !== right.length) return false;
      return crypto.timingSafeEqual(left, right);
    } catch {
      return false;
    }
  }

  async verifyTransaction(reference: string) {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${getPaystackSecret()}` },
      }
    );

    const data = response.data.data;
    if (data.status === 'success') {
      const identity = this.extractIdentity(data.metadata, data.customer?.email);
      const activated = await this.activateSubscription(identity, data.amount, data.reference, data.metadata);
      return { verified: true, amount: data.amount / 100, activated };
    }

    return { verified: false };
  }

  private async activateSubscription(
    identity: { userId?: string; email?: string },
    amountKobo: number,
    reference: string,
    metadata?: any,
  ) {
    const idempotencyKey = `paystack:tx:${reference}:processed`;
    const redis = getRedis();
    if (redis) {
      const reserved = await redis.set(idempotencyKey, '1', 'EX', 60 * 60 * 24 * 90, 'NX');
      if (reserved !== 'OK') return false;
    }

    const amountNaira = amountKobo / 100;
    const durationDays = this.extractDurationDays(metadata) ?? (amountNaira >= 10000 ? 365 : 30);
    const now = new Date();
    const planLabel = this.extractPlanName(metadata) || (durationDays >= 365 ? 'Annual Membership' : 'Monthly Pass');
    const amountFormatted = `₦${amountNaira.toLocaleString()}`;

    const where = identity.userId
      ? { id: identity.userId }
      : identity.email
        ? { email: identity.email }
        : null;

    if (!where) {
      throw new NonRetryablePaymentError(
        `No user identity in payment metadata for reference ${reference}`
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where,
      select: { id: true, name: true, email: true, nextBillingDate: true, planId: true },
    });

    if (!existingUser) {
      throw new NonRetryablePaymentError(
        `User not found for reference ${reference}`
      );
    }

    const baseDate =
      existingUser.nextBillingDate && existingUser.nextBillingDate > now
        ? existingUser.nextBillingDate
        : now;
    const nextBilling = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const planId = await this.resolvePlanId(metadata, existingUser.planId ?? undefined);
    const planSlug = typeof metadata?.planSlug === 'string' ? metadata.planSlug : null;

    // Fix #1: both writes are atomic — if the user update fails, the transaction record is also rolled back
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.transaction.upsert({
        where: { reference },
        update: { status: 'success', amount: amountKobo, userId: existingUser.id, planSlug },
        create: {
          reference,
          status: 'success',
          amount: amountKobo,
          userId: existingUser.id,
          planSlug,
          metadata: metadata ?? {},
          type: 'subscription',
        },
      });

      return tx.user.update({
        where: { id: existingUser.id },
        data: {
          isPremium: true,
          subStatus: 'active',
          subStartDate: now,
          nextBillingDate: nextBilling,
          ...(planId ? { planId } : {}),
        },
        select: { id: true, name: true, email: true },
      });
    });

    emailService
      .sendSubscriptionActivatedEmail(user.email, user.name ?? undefined, planLabel, amountFormatted, nextBilling)
      .catch(console.error);

    const push = getPushService(this.prisma);
    push.sendPaymentReceived(user.id, amountFormatted, planLabel).catch(console.error);
    push.sendSubscriptionActivated(user.id, planLabel, nextBilling).catch(console.error);

    return true;
  }

  async handleWebhook(event: any) {
    if (event.event === 'charge.success') {
      const identity = this.extractIdentity(event.data?.metadata, event.data?.customer?.email);
      await this.activateSubscription(identity, event.data.amount, event.data.reference, event.data?.metadata);
      return true;
    }
    return false;
  }

  // Fix #5: only read top-level metadata fields — custom_fields is dashboard-only
  private extractIdentity(metadata: any, fallbackEmail?: string): { userId?: string; email?: string } {
    const userId = typeof metadata?.userId === 'string' ? metadata.userId : undefined;
    const email = typeof metadata?.originalEmail === 'string'
      ? metadata.originalEmail
      : fallbackEmail;
    return { userId, email };
  }

  private extractDurationDays(metadata: any): number | null {
    const val = Number(metadata?.durationDays);
    return Number.isFinite(val) && val > 0 ? val : null;
  }

  private extractPlanName(metadata: any): string | null {
    const name = metadata?.planName;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }

  private async resolvePlanId(metadata: any, fallbackPlanId?: string): Promise<string | null> {
    const slug = typeof metadata?.planSlug === 'string' ? metadata.planSlug.trim() : null;
    if (!slug) return fallbackPlanId ?? null;
    const plan = await this.prisma.plan.findUnique({ where: { slug }, select: { id: true } });
    return plan?.id ?? fallbackPlanId ?? null;
  }

  private toPaystackCustomerEmail(user: { id: string; email: string }): string {
    return this.isGuestEmail(user.email) ? `member+${user.id}@naijaspride.com` : user.email;
  }

  private isGuestEmail(email: string): boolean {
    return email.endsWith('@naijaspride.guest');
  }
}
