import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { emailService } from '../../shared/services/email.service';
import { OAuth2Client } from 'google-auth-library';

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
};

const getJwtAccessSecret = () => requireEnv('JWT_SECRET');
const getJwtRefreshSecret = () => requireEnv('JWT_REFRESH_SECRET');

const ACCESS_TOKEN_TTL = (process.env.JWT_ACCESS_TOKEN_TTL || '7d') as jwt.SignOptions['expiresIn'];
const REFRESH_TOKEN_TTL = (process.env.JWT_REFRESH_TOKEN_TTL || '120d') as jwt.SignOptions['expiresIn'];

const GOOGLE_CLIENT_IDS = (process.env.GOOGLE_CLIENT_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const googleClient = new OAuth2Client();

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

export const googleAuthSchema = z.object({
  idToken: z.string().min(20),
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
        isPremium: false,
        subStatus: 'inactive',
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

  async loginWithGoogleIdToken(idToken: string) {
    if (GOOGLE_CLIENT_IDS.length === 0) {
      throw new Error('Google auth is not configured. Set GOOGLE_CLIENT_IDS.');
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_IDS,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new Error('Google account has no email address.');
    }
    if (!payload.email_verified) {
      throw new Error('Google email is not verified.');
    }

    const email = payload.email.toLowerCase().trim();
    const name = payload.name?.trim() || null;

    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      const randomPassword = `${Date.now()}-${Math.random()}-${email}`;
      const hashedPassword = await bcrypt.hash(randomPassword, 12);

      user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          isPremium: false,
          subStatus: 'inactive',
        },
      });

      emailService.sendWelcomeEmail(user.email, user.name || undefined).catch(console.error);
    } else if (!user.name && name) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { name },
      });
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
