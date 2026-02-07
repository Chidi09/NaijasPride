import fp from 'fastify-plugin';
import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

// 1. Extend Fastify Request type to include 'user'
declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      role: 'USER' | 'ADMIN';
    };
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-this';

export default fp(async (fastify) => {
  
  // Define the decorator
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      
      if (!authHeader) {
        throw new Error('No token provided');
      }

      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      // Attach user to request so we can access it in the route
      request.user = decoded;
      
    } catch (err) {
      reply.status(401).send({ success: false, error: 'Unauthorized: Invalid token' });
    }
  });
});
