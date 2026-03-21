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

      // Guard: block re-subscription on the same plan while still active
      const dbUser = await fastify.prisma.user.findUnique({
        where: { id: user.id },
        select: { subStatus: true, nextBillingDate: true, plan: { select: { slug: true } } },
      });

      const now = new Date();
      const isActive = dbUser?.subStatus === 'active' && dbUser?.nextBillingDate && dbUser.nextBillingDate > now;
      const isSamePlan = dbUser?.plan?.slug === plan;

      if (isActive && isSamePlan) {
        const expiresAt = dbUser.nextBillingDate!;
        const formatted = expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        return reply.status(409).send({
          success: false,
          message: `You're already subscribed to this plan until ${formatted}. No charge needed.`,
          data: { nextBillingDate: expiresAt.toISOString() },
        });
      }

      // Look up the plan price from DB by slug, fall back to legacy monthly/yearly amounts
      let amountKobo: number;
      let durationDays: number | undefined;
      let planName: string | undefined;
      let planId: string | undefined;
      const dbPlan = await fastify.prisma.plan.findUnique({ where: { slug: plan } });
      if (dbPlan) {
        amountKobo = dbPlan.price * 100; // price is in Naira, Paystack needs kobo
        durationDays = dbPlan.durationDays;
        planName = dbPlan.name;
        planId = dbPlan.id;
      } else {
        // Legacy fallback: monthly = ₦1,500, yearly = ₦12,000
        amountKobo = plan === 'yearly' ? 1_200_000 : 150_000;
        durationDays = plan === 'yearly' ? 365 : 30;
        planName = plan === 'yearly' ? 'Yearly Plan' : 'Monthly Plan';
      }

      const data = await service.initializeTransaction(
        { id: user.id, email: user.email },
        amountKobo,
        {
          planSlug: plan,
          planId,
          planName,
          durationDays,
        }
      );
      return { success: true, data };
    }
  );

  // Verify a Paystack transaction reference (called from /payment/callback page)
  // No auth required — user identity is extracted from Paystack metadata (userId embedded at payment init)
  fastify.post(
    '/verify',
    {
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

    try {
      await service.handleWebhook(req.body);
    } catch (err) {
      fastify.log.error({ err }, '[Paystack] webhook handling failed');
      return reply.status(500).send('Webhook processing failed');
    }

    return reply.status(200).send('OK');
  });
};
