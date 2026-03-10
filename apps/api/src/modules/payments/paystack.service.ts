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

export class PaystackService {
  constructor(private prisma: PrismaClient) {}

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
          planSlug: opts?.planSlug || null,
          planId: opts?.planId || null,
          planName: opts?.planName || null,
          durationDays: opts?.durationDays || null,
          custom_fields: [
            { display_name: 'Payment Type', variable_name: 'payment_type', value: 'subscription' },
            { display_name: 'User ID', variable_name: 'user_id', value: user.id },
            { display_name: 'Original Email', variable_name: 'original_email', value: user.email },
            { display_name: 'Plan Slug', variable_name: 'plan_slug', value: opts?.planSlug || '' },
            { display_name: 'Plan Name', variable_name: 'plan_name', value: opts?.planName || '' },
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

  verifyWebhookSignature(signature: string, body: any): boolean {
    const hash = crypto.createHmac('sha512', getPaystackSecret()).update(JSON.stringify(body)).digest('hex');
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
        headers: {
          Authorization: `Bearer ${getPaystackSecret()}`,
        },
      }
    );

    const data = response.data.data;
    if (data.status === 'success') {
      const identity = this.extractIdentityFromMetadata(data.metadata, data.customer?.email);
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
      if (reserved !== 'OK') {
        return false;
      }
    }

    const amountNaira = amountKobo / 100;
    const configuredDurationDays = this.extractDurationDaysFromMetadata(metadata);
    const durationDays = configuredDurationDays ?? (amountNaira >= 10000 ? 365 : 30);
    const now = new Date();
    const planLabel = this.extractPlanNameFromMetadata(metadata) || (durationDays >= 365 ? 'Annual Membership' : 'Monthly Pass');
    const amountFormatted = `₦${amountNaira.toLocaleString()}`;

    const where = identity.userId ? { id: identity.userId } : identity.email ? { email: identity.email } : null;
    if (!where) {
      throw new Error(`Unable to activate subscription for reference ${reference}: no user identity in payment metadata`);
    }

    const existingUser = await this.prisma.user.findUnique({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        nextBillingDate: true,
        planId: true,
      },
    });

    if (!existingUser) {
      throw new Error(`Unable to activate subscription for reference ${reference}: user not found`);
    }

    const baseDate =
      existingUser.nextBillingDate && existingUser.nextBillingDate.getTime() > now.getTime()
        ? existingUser.nextBillingDate
        : now;
    const nextBilling = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const planId = await this.resolvePlanIdFromMetadata(metadata, existingUser.planId || undefined);

    const user = await this.prisma.user.update({
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

    // Send rich subscription-activated email (includes what they unlocked + renewal date)
    emailService.sendSubscriptionActivatedEmail(
      user.email,
      user.name || undefined,
      planLabel,
      amountFormatted,
      nextBilling
    ).catch(console.error);

    // Push notifications: payment received + subscription activated
    const push = getPushService(this.prisma);
    push.sendPaymentReceived(user.id, amountFormatted, planLabel).catch(console.error);
    push.sendSubscriptionActivated(user.id, planLabel, nextBilling).catch(console.error);
    return true;
  }

  async handleWebhook(event: any) {
    if (event.event === 'charge.success') {
      const identity = this.extractIdentityFromMetadata(event.data?.metadata, event.data?.customer?.email);
      await this.activateSubscription(identity, event.data.amount, event.data.reference, event.data?.metadata);
      return true;
    }
    return false;
  }

  private extractDurationDaysFromMetadata(metadata: any): number | null {
    if (!metadata || typeof metadata !== 'object') return null;
    const direct = typeof metadata.durationDays === 'number' ? metadata.durationDays : Number.parseInt(`${metadata.durationDays || ''}`, 10);
    if (Number.isFinite(direct) && direct > 0) return direct;
    return null;
  }

  private extractPlanNameFromMetadata(metadata: any): string | null {
    if (!metadata || typeof metadata !== 'object') return null;
    if (typeof metadata.planName === 'string' && metadata.planName.trim()) return metadata.planName.trim();
    const customFields = Array.isArray(metadata.custom_fields) ? metadata.custom_fields : [];
    const fromField = customFields.find((f: any) => f?.variable_name === 'plan_name')?.value;
    if (typeof fromField === 'string' && fromField.trim()) return fromField.trim();
    return null;
  }

  private async resolvePlanIdFromMetadata(metadata: any, fallbackPlanId?: string): Promise<string | null> {
    if (!metadata || typeof metadata !== 'object') return fallbackPlanId || null;

    const customFields = Array.isArray(metadata.custom_fields) ? metadata.custom_fields : [];
    const planSlug =
      (typeof metadata.planSlug === 'string' && metadata.planSlug.trim() ? metadata.planSlug.trim() : null) ||
      (typeof customFields.find((f: any) => f?.variable_name === 'plan_slug')?.value === 'string'
        ? String(customFields.find((f: any) => f?.variable_name === 'plan_slug')?.value).trim()
        : null);

    if (!planSlug) return fallbackPlanId || null;

    const plan = await this.prisma.plan.findUnique({ where: { slug: planSlug }, select: { id: true } });
    return plan?.id || fallbackPlanId || null;
  }

  private toPaystackCustomerEmail(user: { id: string; email: string }): string {
    if (!this.isGuestEmail(user.email)) return user.email;
    return `member+${user.id}@naijaspride.com`;
  }

  private isGuestEmail(email: string): boolean {
    return email.endsWith('@naijaspride.guest');
  }

  private extractIdentityFromMetadata(metadata: any, fallbackEmail?: string): { userId?: string; email?: string } {
    if (!metadata || typeof metadata !== 'object') {
      return fallbackEmail ? { email: fallbackEmail } : {};
    }

    const directUserId = typeof metadata.userId === 'string' ? metadata.userId : undefined;
    const directEmail = typeof metadata.originalEmail === 'string' ? metadata.originalEmail : undefined;

    const customFields = Array.isArray(metadata.custom_fields) ? metadata.custom_fields : [];
    const userIdFromFields = customFields.find((f: any) => f?.variable_name === 'user_id')?.value;
    const emailFromFields = customFields.find((f: any) => f?.variable_name === 'original_email')?.value;

    const userId = (directUserId || userIdFromFields) as string | undefined;
    const email = (directEmail || emailFromFields || fallbackEmail) as string | undefined;

    return { userId, email };
  }
}
