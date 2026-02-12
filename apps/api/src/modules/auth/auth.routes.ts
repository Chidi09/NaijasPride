import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { randomBytes } from 'crypto';
import {
  AuthService,
  googleAuthSchema,
  loginSchema,
  refreshTokenSchema,
  signupSchema,
} from './auth.service';

const CSRF_COOKIE_NAME = 'np_csrf';

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

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
      const result = await service.login(request.body);
      return { success: true, data: result };
    } catch (error: unknown) {
      return reply.status(401).send({
        success: false,
        error: getErrorMessage(error, 'Invalid credentials'),
      });
    }
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
      const result = await service.loginWithGoogleIdToken(idToken);
      return { success: true, data: result };
    } catch (error: unknown) {
      return reply.status(401).send({
        success: false,
        error: getErrorMessage(error, 'Google login failed'),
      });
    }
  });
};
