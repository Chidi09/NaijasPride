import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { randomBytes } from 'crypto';
import {
  AuthService,
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from './auth.service';

const CSRF_COOKIE_NAME = 'np_csrf';

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const getFirstForwardedIp = (value: string | string[] | undefined): string | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const first = raw.split(',')[0]?.trim();
  return first || undefined;
};

const getRequestIp = (request: { ip: string; headers: Record<string, unknown> }): string => {
  const forwarded = getFirstForwardedIp(request.headers['x-forwarded-for'] as string | string[] | undefined);
  return forwarded || request.ip;
};

const getUserAgent = (request: { headers: Record<string, unknown> }): string | undefined => {
  const raw = request.headers['user-agent'];
  return typeof raw === 'string' ? raw : undefined;
};

const buildCsrfCookie = (token: string) => {
  const attrs = [
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'SameSite=Strict',
    'HttpOnly',
    process.env.NODE_ENV === 'production' ? 'Secure' : null,
  ].filter(Boolean);
  return attrs.join('; ');
};

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = new AuthService(fastify.prisma);
  const rateLimitByIp = (max: number, timeWindow: string) => ({
    max,
    timeWindow,
    keyGenerator: (request: { ip: string }) => request.ip,
  });

  app.get('/csrf-token', async (_request, reply) => {
    const token = randomBytes(32).toString('hex');
    reply.header('Set-Cookie', buildCsrfCookie(token));
    reply.header('Cache-Control', 'no-store');
    return { success: true, data: { csrfToken: token } };
  });

  app.post('/signup', {
    schema: {
      body: signupSchema,
    },
    config: {
      rateLimit: rateLimitByIp(5, '15 minutes'),
    },
  }, async (request, reply) => {
    try {
      const user = await service.signup(request.body);
      return reply.status(201).send({ success: true, data: user });
    } catch (error: unknown) {
      return reply.status(400).send({
        success: false,
        error: getErrorMessage(error, 'Signup failed'),
      });
    }
  });

  app.post('/login', {
    schema: {
      body: loginSchema,
    },
    config: {
      rateLimit: rateLimitByIp(5, '15 minutes'),
    },
  }, async (request, reply) => {
    try {
      const result = await service.login(request.body, {
        ipAddress: getRequestIp(request),
        userAgent: getUserAgent(request),
      });
      return { success: true, data: result };
    } catch (error: unknown) {
      return reply.status(401).send({
        success: false,
        error: getErrorMessage(error, 'Invalid credentials'),
      });
    }
  });

  // POST /auth/logout — best-effort session teardown.
  // Tokens are JWTs with no server-side blocklist, so this endpoint is a
  // no-op today but is the right hook point for a future token blocklist.
  app.post('/logout', {
    preHandler: [app.authenticate],
    config: { rateLimit: rateLimitByIp(30, '1 minute') },
  }, async (_request, reply) => {
    return reply.send({ success: true });
  });

  app.post('/refresh', {
    schema: {
      body: refreshTokenSchema,
    },
    config: {
      rateLimit: rateLimitByIp(20, '15 minutes'),
    },
  }, async (request, reply) => {
    try {
      const { refreshToken } = request.body;
      const result = await service.refreshSession(refreshToken);
      return { success: true, data: result };
    } catch (error: unknown) {
      return reply.status(401).send({
        success: false,
        error: getErrorMessage(error, 'Invalid refresh token'),
      });
    }
  });

  app.post('/google', {
    schema: {
      body: googleAuthSchema,
    },
    config: {
      rateLimit: rateLimitByIp(20, '15 minutes'),
    },
  }, async (request, reply) => {
    try {
      const { idToken } = request.body as { idToken: string };
      const result = await service.loginWithGoogleIdToken(idToken, {
        ipAddress: getRequestIp(request),
        userAgent: getUserAgent(request),
      });
      return { success: true, data: result };
    } catch (error: unknown) {
      return reply.status(401).send({
        success: false,
        error: getErrorMessage(error, 'Google login failed'),
      });
    }
  });

  // Password Reset Routes
  app.post('/forgot-password', {
    schema: {
      body: forgotPasswordSchema,
    },
    config: {
      rateLimit: rateLimitByIp(3, '15 minutes'),
    },
  }, async (request, reply) => {
    try {
      const { email } = request.body;
      await service.requestPasswordReset(email);
      // Always return success to prevent email enumeration
      return { success: true, message: 'If an account exists, a reset email has been sent' };
    } catch (error: unknown) {
      return reply.status(400).send({
        success: false,
        error: getErrorMessage(error, 'Failed to process request'),
      });
    }
  });

  app.post('/reset-password', {
    schema: {
      body: resetPasswordSchema,
    },
    config: {
      rateLimit: rateLimitByIp(5, '15 minutes'),
    },
  }, async (request, reply) => {
    try {
      const { token, password } = request.body;
      await service.resetPassword(token, password);
      return { success: true, message: 'Password has been reset successfully' };
    } catch (error: unknown) {
      return reply.status(400).send({
        success: false,
        error: getErrorMessage(error, 'Invalid or expired reset token'),
      });
    }
  });

  // Email Verification Routes
  app.post('/verify-email', {
    schema: {
      body: verifyEmailSchema,
    },
    config: {
      rateLimit: rateLimitByIp(5, '15 minutes'),
    },
  }, async (request, reply) => {
    try {
      const { token } = request.body;
      const result = await service.verifyEmail(token);
      return { success: true, data: result, message: 'Email verified successfully' };
    } catch (error: unknown) {
      return reply.status(400).send({
        success: false,
        error: getErrorMessage(error, 'Invalid or expired verification token'),
      });
    }
  });

  app.post('/resend-verification', {
    preHandler: [app.authenticate],
    config: {
      rateLimit: rateLimitByIp(3, '15 minutes'),
    },
  }, async (request, reply) => {
    try {
      const userId = request.user.userId;
      await service.sendVerificationEmail(userId);
      return { success: true, message: 'Verification email sent' };
    } catch (error: unknown) {
      return reply.status(401).send({
        success: false,
        error: getErrorMessage(error, 'Failed to send verification email'),
      });
    }
  });

  // Guest Account Routes
  app.post('/guest', {
    config: {
      rateLimit: rateLimitByIp(10, '1 hour'),
    },
  }, async (_request, reply) => {
    try {
      const result = await service.createGuestAccount();
      return reply.status(201).send({ success: true, data: result });
    } catch (error: unknown) {
      return reply.status(500).send({
        success: false,
        error: getErrorMessage(error, 'Failed to create guest account'),
      });
    }
  });

  app.post('/convert-guest', {
    preHandler: [app.authenticate],
    schema: {
      body: signupSchema,
    },
    config: {
      rateLimit: rateLimitByIp(5, '15 minutes'),
    },
  }, async (request, reply) => {
    try {
      const userId = request.user.userId;
      const result = await service.convertGuestToUser(userId, request.body);
      return { success: true, data: result };
    } catch (error: unknown) {
      return reply.status(400).send({
        success: false,
        error: getErrorMessage(error, 'Failed to convert guest account'),
      });
    }
  });
};
