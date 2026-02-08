import fp from 'fastify-plugin';
import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

// 1. Extend Fastify Request type to include 'user'
declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      userId: string;
      email: string;
      role: 'USER' | 'ADMIN';
    };
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void | FastifyReply>;
  }
}

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
};

const JWT_SECRET = requireEnv('JWT_SECRET');

type JwtPayload = {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  type?: 'access' | 'refresh';
};

export default fp(async (fastify) => {
  // Define the decorator
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ success: false, error: 'Unauthorized: Missing bearer token' });
      }

      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      if (decoded.type && decoded.type !== 'access') {
        return reply.status(401).send({ success: false, error: 'Unauthorized: Invalid token type' });
      }

      // Keep both id and userId for backward compatibility with existing routes.
      request.user = {
        id: decoded.id,
        userId: decoded.id,
        email: decoded.email,
        role: decoded.role,
      };
    } catch (err) {
      return reply.status(401).send({ success: false, error: 'Unauthorized: Invalid token' });
    }
  });
});
