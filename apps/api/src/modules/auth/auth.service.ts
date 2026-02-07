import { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { emailService } from '../../shared/services/email.service';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-this';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

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

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password, ...userWithoutPass } = user;
    return { user: userWithoutPass, token };
  }
}
