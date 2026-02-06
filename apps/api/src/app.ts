import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { healthRoutes } from './modules/health/health.routes';
import { movieRoutes } from './modules/movies/movies.routes';
import prismaPlugin from './plugins/prisma';

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
  await app.register(helmet);
  await app.register(cors, {
    origin: '*', // For development only
  });
  await app.register(prismaPlugin); // Connect to DB

  // 2. Configure Zod for Validation
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // 3. Register Routes
  await app.register(healthRoutes, { prefix: '/api/health' });
  await app.register(movieRoutes, { prefix: '/api/movies' });

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
