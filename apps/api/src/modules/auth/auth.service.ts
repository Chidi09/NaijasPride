import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { emailService } from '../../shared/services/email.service';

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
};

const getJwtAccessSecret = () => requireEnv('JWT_SECRET');
const getJwtRefreshSecret = () => requireEnv('JWT_REFRESH_SECRET');

const ACCESS_TOKEN_TTL = (process.env.JWT_ACCESS_TOKEN_TTL || '20m') as jwt.SignOptions['expiresIn'];
const REFRESH_TOKEN_TTL = (process.env.JWT_REFRESH_TOKEN_TTL || '30d') as jwt.SignOptions['expiresIn'];

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20),
});

type AccessPayload = {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  type: 'access';
};

type RefreshPayload = {
  id: string;
  type: 'refresh';
};

export class AuthService {
  constructor(private prisma: PrismaClient) {}

  async signup(data: z.infer<typeof signupSchema>) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new Error('User already exists');

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
      },
    });

    // Send welcome email (don't await - don't block response)
    emailService.sendWelcomeEmail(user.email, user.name || undefined).catch(console.error);

    const { password, ...result } = user;
    return result;
  }

  async login(data: z.infer<typeof loginSchema>) {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw new Error('Invalid credentials');

    const isValid = await bcrypt.compare(data.password, user.password);
    if (!isValid) throw new Error('Invalid credentials');

    return this.createSession(user);
  }

  async refreshSession(refreshToken: string) {
    let decoded: RefreshPayload;
    try {
      decoded = jwt.verify(refreshToken, getJwtRefreshSecret() as jwt.Secret) as RefreshPayload;
    } catch {
      throw new Error('Invalid refresh token');
    }

    if (decoded.type !== 'refresh' || !decoded.id) {
      throw new Error('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      throw new Error('Invalid refresh token');
    }

    return this.createSession(user);
  }

  private createSession(user: { id: string; email: string; role: string; password: string }) {
    const accessPayload: AccessPayload = {
      id: user.id,
      email: user.email,
      role: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
      type: 'access',
    };
    const refreshPayload: RefreshPayload = {
      id: user.id,
      type: 'refresh',
    };

    const token = jwt.sign(accessPayload, getJwtAccessSecret() as jwt.Secret, {
      expiresIn: ACCESS_TOKEN_TTL,
    });
    const refreshToken = jwt.sign(refreshPayload, getJwtRefreshSecret() as jwt.Secret, {
      expiresIn: REFRESH_TOKEN_TTL,
    });

    const { password, ...userWithoutPass } = user;
    return { user: userWithoutPass, token, refreshToken };
  }
}
