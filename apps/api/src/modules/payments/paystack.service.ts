import axios from 'axios';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { emailService } from '../../shared/services/email.service';
import { getPushService } from '../../shared/services/push-notification.service';

const getPaystackSecret = () => {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('PAYSTACK_SECRET_KEY environment variable is required');
  return key;
};

export class PaystackService {
  constructor(private prisma: PrismaClient) {}

  async initializeTransaction(user: { id: string; email: string }, amountKobo: number) {
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
          custom_fields: [
            { display_name: 'Payment Type', variable_name: 'payment_type', value: 'subscription' },
            { display_name: 'User ID', variable_name: 'user_id', value: user.id },
            { display_name: 'Original Email', variable_name: 'original_email', value: user.email },
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
    return hash === signature;
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
      await this.activateSubscription(identity, data.amount, data.reference);
      return { verified: true, amount: data.amount / 100 };
    }

    return { verified: false };
  }

  private async activateSubscription(identity: { userId?: string; email?: string }, amountKobo: number, reference: string) {
    const amountNaira = amountKobo / 100;
    const isYearly = amountNaira >= 10000;
    const durationDays = isYearly ? 365 : 30;
    const now = new Date();
    const nextBilling = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const planLabel = isYearly ? 'Annual Membership' : 'Monthly Pass';
    const amountFormatted = `₦${amountNaira.toLocaleString()}`;

    const where = identity.userId ? { id: identity.userId } : identity.email ? { email: identity.email } : null;
    if (!where) {
      throw new Error(`Unable to activate subscription for reference ${reference}: no user identity in payment metadata`);
    }

    const user = await this.prisma.user.update({
      where,
      data: {
        isPremium: true,
        subStatus: 'active',
        subStartDate: now,
        nextBillingDate: nextBilling,
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
  }

  async handleWebhook(event: any) {
    if (event.event === 'charge.success') {
      const identity = this.extractIdentityFromMetadata(event.data?.metadata, event.data?.customer?.email);
      await this.activateSubscription(identity, event.data.amount, event.data.reference);
      return true;
    }
    return false;
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
