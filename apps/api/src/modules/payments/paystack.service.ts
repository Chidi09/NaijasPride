import axios from 'axios';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { emailService } from '../../shared/services/email.service';

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

  async handleWebhook(event: any) {
    if (event.event === 'charge.success') {
      const email = event.data.customer.email;
      const amount = event.data.amount / 100; // Convert from kobo to naira
      const plan = event.data.plan ? 'Premium Subscription' : 'One-time Payment';

      await this.prisma.user.update({
        where: { email },
        data: { isPremium: true },
      });

      // Send receipt email (don't await - don't block webhook response)
      emailService.sendReceipt(email, `₦${amount.toLocaleString()}`, plan).catch(console.error);

      return true;
    }
    return false;
  }
}
