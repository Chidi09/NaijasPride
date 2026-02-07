import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sanitizeHtml from 'sanitize-html';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { healthRoutes } from './modules/health/health.routes';
import { movieRoutes } from './modules/movies/movies.routes';
import { bookRoutes } from './modules/books/books.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { paymentRoutes } from './modules/payments/payments.routes';
import { profileRoutes } from './modules/users/profile.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { watchRoutes } from './modules/users/watch.routes';
import prismaPlugin from './plugins/prisma';
import authPlugin from './shared/plugins/auth.plugin';

const buildServer = async () => {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // 1. Register Global Plugins
  await app.register(helmet, {
    contentSecurityPolicy: false,
    global: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'You are hitting the server too fast. Chill na. 🥤',
      date: Date.now(),
      expiresIn: context.ttl
    })
  });

  await app.register(cors, {
    origin: '*',
  });
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  // Global Hook: Sanitize Body to prevent XSS
  app.addHook('preValidation', async (req) => {
    if (req.body && typeof req.body === 'object') {
      for (const key in req.body) {
        if (typeof (req.body as any)[key] === 'string') {
          // Allow basic formatting (b, i, p) but strip scripts/iframes
          (req.body as any)[key] = sanitizeHtml((req.body as any)[key], {
            allowedTags: [], // Strict mode: No HTML allowed in titles/descriptions
            allowedAttributes: {}
          });
        }
      }
    }
  });

  // 2. Configure Zod for Validation
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // 3. Register Routes
  await app.register(healthRoutes, { prefix: '/api/health' });
  await app.register(authRoutes, { prefix: '/api/auth' }); // Auth routes
  await app.register(movieRoutes, { prefix: '/api/movies' });
  await app.register(bookRoutes, { prefix: '/api/books' });
  await app.register(paymentRoutes, { prefix: '/api/payments' });
  await app.register(profileRoutes, { prefix: '/api/profile' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(watchRoutes, { prefix: '/api/watch' });

  return app;
};

const start = async () => {
  try {
    const app = await buildServer();
    const port = parseInt(process.env.PORT || '3000', 10);
    
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 NaijasPride API running on http://localhost:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
