import { FastifyPluginAsync } from 'fastify';
import { PaystackService } from './paystack.service';
import { z } from 'zod';

const initializePaymentSchema = z.object({
  plan: z.enum(['monthly', 'yearly']),
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

      const amount = plan === 'yearly' ? 1_200_000 : 150_000; // kobo
      const data = await service.initializeTransaction(user.email, amount);
      return { success: true, data };
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
