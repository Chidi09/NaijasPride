import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AuthService, loginSchema, signupSchema } from './auth.service';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = new AuthService(fastify.prisma);

  app.post('/signup', {
    schema: {
      body: signupSchema,
    },
  }, async (request, reply) => {
    try {
      const user = await service.signup(request.body);
      return reply.status(201).send({ success: true, data: user });
    } catch (error: any) {
      return reply.status(400).send({ success: false, error: error.message });
    }
  });

  app.post('/login', {
    schema: {
      body: loginSchema,
    },
  }, async (request, reply) => {
    try {
      const result = await service.login(request.body);
      return { success: true, data: result };
    } catch (error: any) {
      return reply.status(401).send({ success: false, error: error.message });
    }
  });
};
