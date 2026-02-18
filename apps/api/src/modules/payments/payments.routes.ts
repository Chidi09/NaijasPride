import { FastifyPluginAsync } from 'fastify';
import { PaystackService } from './paystack.service';
import { z } from 'zod';

const initializePaymentSchema = z.object({
  // Accept either a plan slug (mobile/standard/family) or legacy monthly/yearly
  plan: z.string().min(1),
});

const verifyPaymentSchema = z.object({
  reference: z.string().min(1),
});

export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new PaystackService(fastify.prisma);

  // Initialize payment link (requires auth)
  fastify.post(
    '/initialize',
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: initializePaymentSchema,
      },
    },
    async (req, reply) => {
      const { plan } = req.body as z.infer<typeof initializePaymentSchema>;
      const user = req.user;

      // Look up the plan price from DB by slug, fall back to legacy monthly/yearly amounts
      let amountKobo: number;
      const dbPlan = await fastify.prisma.plan.findUnique({ where: { slug: plan } });
      if (dbPlan) {
        amountKobo = dbPlan.price * 100; // price is in Naira, Paystack needs kobo
      } else {
        // Legacy fallback: monthly = ₦1,500, yearly = ₦12,000
        amountKobo = plan === 'yearly' ? 1_200_000 : 150_000;
      }

      const data = await service.initializeTransaction(user.email, amountKobo);
      return { success: true, data };
    }
  );

  // Verify a Paystack transaction reference (called from /payment/callback page)
  fastify.post(
    '/verify',
    {
      onRequest: [fastify.authenticate],
      schema: { body: verifyPaymentSchema },
    },
    async (req, reply) => {
      const { reference } = req.body as z.infer<typeof verifyPaymentSchema>;
      const result = await service.verifyTransaction(reference);
      if (result.verified) {
        return { success: true, message: 'Payment verified. Membership activated.' };
      }
      return reply.status(400).send({ success: false, message: 'Payment not confirmed by Paystack.' });
    }
  );

  // Paystack webhook
  fastify.post('/webhook', async (req, reply) => {
    const signature = req.headers['x-paystack-signature'] as string;

    if (!signature || !service.verifyWebhookSignature(signature, req.body)) {
      return reply.status(401).send('Invalid signature');
    }

    service.handleWebhook(req.body).catch((err) => {
      fastify.log.error({ err }, '[Paystack] webhook handling failed');
    });

    return reply.status(200).send('OK');
  });
};
