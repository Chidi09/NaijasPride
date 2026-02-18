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

  async initializeTransaction(email: string, amountKobo: number) {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: amountKobo,
        callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
        metadata: {
          custom_fields: [
            { display_name: 'Payment Type', variable_name: 'payment_type', value: 'subscription' },
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
      await this.activateSubscription(data.customer.email, data.amount, data.reference);
      return { verified: true, amount: data.amount / 100 };
    }

    return { verified: false };
  }

  private async activateSubscription(email: string, amountKobo: number, reference: string) {
    const amountNaira = amountKobo / 100;
    const isYearly = amountNaira >= 10000;
    const durationDays = isYearly ? 365 : 30;
    const now = new Date();
    const nextBilling = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const planLabel = isYearly ? 'Annual Membership' : 'Monthly Pass';
    const amountFormatted = `₦${amountNaira.toLocaleString()}`;

    const user = await this.prisma.user.update({
      where: { email },
      data: {
        isPremium: true,
        subStatus: 'active',
        subStartDate: now,
        nextBillingDate: nextBilling,
      },
      select: { id: true, name: true },
    });

    // Send rich subscription-activated email (includes what they unlocked + renewal date)
    emailService.sendSubscriptionActivatedEmail(
      email,
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
      const email = event.data.customer.email;
      await this.activateSubscription(email, event.data.amount, event.data.reference);
      return true;
    }
    return false;
  }
}
