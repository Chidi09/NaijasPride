import { FastifyPluginAsync } from "fastify";
import {
  PaystackService,
  NonRetryablePaymentError,
  PaystackEvent,
} from "./paystack.service";
import { z } from "zod";
import { BadRequestError } from "../../shared/errors/app-error";

const initializePaymentSchema = z.object({
  plan: z.string().min(1),
});

const verifyPaymentSchema = z.object({
  reference: z.string().min(1),
});

export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new PaystackService(fastify.prisma);

  // Fix #2: capture raw body before JSON parsing so webhook HMAC uses exact bytes from Paystack
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      try {
        const parsed = JSON.parse(body.toString());
        (req as any).rawBody = body;
        done(null, parsed);
      } catch (e) {
        done(e as Error, undefined);
      }
    },
  );

  // Initialize payment link (requires auth)
  fastify.post(
    "/initialize",
    {
      onRequest: [fastify.authenticate],
      schema: { body: initializePaymentSchema },
    },
    async (req, reply) => {
      const { plan } = req.body as z.infer<typeof initializePaymentSchema>;
      const user = req.user;

      // Guard: block re-subscription on the same plan while still active
      const dbUser = await fastify.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          subStatus: true,
          nextBillingDate: true,
          plan: { select: { slug: true } },
        },
      });

      const now = new Date();
      const isActive =
        dbUser?.subStatus === "active" &&
        dbUser?.nextBillingDate &&
        dbUser.nextBillingDate > now;
      const isSamePlan = dbUser?.plan?.slug === plan;

      if (isActive && isSamePlan) {
        const expiresAt = dbUser.nextBillingDate!;
        const formatted = expiresAt.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        return reply.status(409).send({
          success: false,
          message: `You're already subscribed to this plan until ${formatted}. No charge needed.`,
          data: { nextBillingDate: expiresAt.toISOString() },
        });
      }

      // Fix #3: plan pricing logic lives in the service
      const { amountKobo, durationDays, planName, planId } =
        await service.resolvePlanBySlug(plan);

      const data = await service.initializeTransaction(
        { id: user.id, email: user.email },
        amountKobo,
        { planSlug: plan, planId, planName, durationDays },
      );

      return { success: true, data };
    },
  );

  // Verify a Paystack transaction reference (called from /payment/callback page).
  // No auth — user identity comes from Paystack metadata embedded at payment init.
  // Fix #4: tighter rate limit than the global 300/min default
  fastify.post(
    "/verify",
    {
      config: { rateLimit: { max: 15, timeWindow: "1 minute" } },
      schema: { body: verifyPaymentSchema },
    },
    async (req, reply) => {
      const { reference } = req.body as z.infer<typeof verifyPaymentSchema>;
      const result = await service.verifyTransaction(reference);
      if (result.verified) {
        return {
          success: true,
          message: "Payment verified. Membership activated.",
        };
      }
      throw new BadRequestError("Payment not confirmed by Paystack.");
    },
  );

  // Paystack webhook
  fastify.post("/webhook", async (req, reply) => {
    const signature = req.headers["x-paystack-signature"] as string;
    const rawBody = (req as any).rawBody as Buffer;

    // Fix #2: verify against raw bytes, not re-serialized JSON
    if (!signature || !service.verifyWebhookSignature(signature, rawBody)) {
      return reply.status(401).send("Invalid signature");
    }

    await service.handleWebhook(req.body as PaystackEvent);

    return reply.status(200).send("OK");
  });
};
