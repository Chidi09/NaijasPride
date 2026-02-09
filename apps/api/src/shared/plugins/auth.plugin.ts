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

const getJwtSecret = () => process.env.JWT_SECRET;

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

      const jwtSecret = getJwtSecret();
      if (!jwtSecret) {
        request.log.error('JWT_SECRET environment variable is required');
        return reply.status(500).send({ success: false, error: 'Server misconfigured: JWT_SECRET missing' });
      }

      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
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
