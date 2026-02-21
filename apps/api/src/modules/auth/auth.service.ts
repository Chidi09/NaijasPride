import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { emailService } from '../../shared/services/email.service';
import { getPushService } from '../../shared/services/push-notification.service';
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

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(6),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20),
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

type LoginContext = {
  ipAddress?: string;
  userAgent?: string;
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

    // Send welcome + verification emails (fire-and-forget)
    emailService.sendWelcomeEmail(user.email, user.name || undefined).catch(console.error);
    getPushService(this.prisma).sendWelcome(user.id, user.name || undefined).catch(console.error);

    // Auto-send verification email on signup
    this.sendVerificationEmail(user.id).catch(console.error);

    const { password, ...result } = user;
    return result;
  }

  async login(data: z.infer<typeof loginSchema>, context?: LoginContext) {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw new Error('Invalid credentials');

    const isValid = await bcrypt.compare(data.password, user.password);
    if (!isValid) throw new Error('Invalid credentials');

    const session = this.createSession(user);
    this.maybeSendSecurityLoginAlert(user.id, context).catch(console.error);
    return session;
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

  async loginWithGoogleIdToken(idToken: string, context?: LoginContext) {
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
      getPushService(this.prisma).sendWelcome(user.id, user.name || undefined).catch(console.error);
    } else if (!user.name && name) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { name },
      });
    }

    const session = this.createSession(user);
    this.maybeSendSecurityLoginAlert(user.id, context).catch(console.error);
    return session;
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal if user exists
      return { success: true };
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      },
    });

    // Send email asynchronously
    emailService.sendPasswordResetEmail(user.email, resetToken, user.name || undefined).catch(console.error);

    return { success: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    emailService.sendPasswordChangedEmail(user.email, user.name || undefined).catch(console.error);
    getPushService(this.prisma).sendPasswordChanged(user.id).catch(console.error);

    return { success: true };
  }

  async sendVerificationEmail(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (user.emailVerified) throw new Error('Email already verified');

    const verificationToken = randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
      },
    });

    emailService.sendVerificationEmail(user.email, verificationToken, user.name || undefined).catch(console.error);

    return { success: true };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new Error('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    getPushService(this.prisma).sendEmailVerified(user.id).catch(console.error);

    return { success: true, email: user.email };
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

  private async maybeSendSecurityLoginAlert(userId: string, context?: LoginContext) {
    if (!context?.userAgent) return;

    const normalizedUa = context.userAgent.trim().slice(0, 255);
    if (!normalizedUa) return;

    const knownToken = await this.prisma.pushNotificationToken.findFirst({
      where: {
        userId,
        isActive: true,
        userAgent: normalizedUa,
      },
      select: { id: true },
    });

    // If this user-agent was already seen on an active push-enabled device,
    // do not spam with repeated security notices.
    if (knownToken) return;

    const shortLabel = this.deriveDeviceLabel(normalizedUa);
    getPushService(this.prisma)
      .sendSecurityLoginAlert(userId, context.ipAddress, shortLabel)
      .catch(console.error);
  }

  private deriveDeviceLabel(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    const platform = ua.includes('android')
      ? 'Android'
      : ua.includes('iphone') || ua.includes('ipad')
        ? 'iOS'
        : ua.includes('mac os')
          ? 'macOS'
          : ua.includes('windows')
            ? 'Windows'
            : ua.includes('linux')
              ? 'Linux'
              : 'Device';

    const browser = ua.includes('edg/')
      ? 'Edge'
      : ua.includes('chrome/')
        ? 'Chrome'
        : ua.includes('safari/') && !ua.includes('chrome/')
          ? 'Safari'
          : ua.includes('firefox/')
            ? 'Firefox'
            : 'Browser';

    return `${platform} ${browser}`;
  }

  async createGuestAccount() {
    // Generate a unique guest ID
    const guestId = randomBytes(8).toString('hex');
    const email = `guest_${guestId}@naijaspride.guest`;
    const password = randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Guest accounts expire in 30 days
    const guestExpiresAt = new Date();
    guestExpiresAt.setDate(guestExpiresAt.getDate() + 30);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: 'Guest User',
        isGuest: true,
        guestExpiresAt,
        emailVerified: true, // Auto-verify guest accounts
      },
    });

    const session = this.createSession(user);
    return { ...session, isGuest: true };
  }

  async convertGuestToUser(guestUserId: string, data: z.infer<typeof signupSchema>) {
    const guestUser = await this.prisma.user.findUnique({
      where: { id: guestUserId },
    });

    if (!guestUser || !guestUser.isGuest) {
      throw new Error('Invalid guest account');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new Error('Email already in use');

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const updatedUser = await this.prisma.user.update({
      where: { id: guestUserId },
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        isGuest: false,
        guestExpiresAt: null,
        emailVerified: false,
      },
    });

    // Send welcome email
    emailService.sendWelcomeEmail(updatedUser.email, updatedUser.name || undefined).catch(console.error);
    getPushService(this.prisma).sendWelcome(updatedUser.id, updatedUser.name || undefined).catch(console.error);

    // Send verification email
    this.sendVerificationEmail(updatedUser.id).catch(console.error);

    const { password, ...result } = updatedUser;
    return { ...result, message: 'Account converted successfully. Please verify your email.' };
  }
}
