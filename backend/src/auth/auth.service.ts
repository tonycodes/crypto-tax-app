import { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { AuthError } from './auth.errors';
import { encryptSecret, decryptSecret } from './crypto.util';
import { generateTotpSecret, verifyTotp } from './totp.util';

interface SanitizedUser {
  id: string;
  email: string;
  planId: string;
  twoFactorEnabled: boolean;
}

interface AuthResponse {
  user: SanitizedUser;
  token: string;
}

interface TokenPayload {
  userId: string;
  email: string;
  planId: string;
}

interface LoginOptions {
  twoFactorToken?: string;
  timestamp?: number;
}

export class AuthService {
  private jwtSecret: string;

  constructor(private prisma: PrismaClient) {
    this.jwtSecret = process.env['JWT_SECRET'] || 'default_secret_change_in_production';
  }

  async register(email: string, password: string): Promise<SanitizedUser> {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw AuthError.invalidEmail();
    }

    // Validate password strength
    if (password.length < 8) {
      throw AuthError.weakPassword();
    }

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw AuthError.emailInUse();
    }

    // Check basic plan exists
    const basicPlan = await this.prisma.plan.findUnique({
      where: { id: 'basic' },
    });

    if (!basicPlan) {
      throw AuthError.planMissing();
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with basic plan
    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        passwordHash: hashedPassword,
        planId: 'basic',
      },
    });

    return this.sanitizeUser(user);
  }

  async login(email: string, password: string, options?: LoginOptions): Promise<AuthResponse> {
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { plan: true },
    });

    if (!user) {
      throw AuthError.invalidCredentials();
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw AuthError.invalidCredentials();
    }

    if (user.twoFactorEnabled) {
      if (!user.twoFactorSecret) {
        throw AuthError.twoFactorNotEnabled();
      }

      const token = options?.twoFactorToken;
      if (!token) {
        throw AuthError.missingTwoFactorToken();
      }

      const secret = decryptSecret(user.twoFactorSecret);
      const verificationOptions =
        options?.timestamp !== undefined ? { timestamp: options.timestamp } : undefined;
      const isValidToken = verifyTotp(secret, token, verificationOptions);

      if (!isValidToken) {
        throw AuthError.invalidCredentials();
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        planId: user.planId,
      } as TokenPayload,
      this.jwtSecret,
      { expiresIn: '7d' }
    );

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload & {
        iat: number;
        exp: number;
      };

      // Verify user still exists
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        throw AuthError.userNotFound();
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        planId: user.planId,
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw AuthError.tokenExpired();
      }
      if (error instanceof AuthError) {
        throw error;
      }
      throw AuthError.invalidToken();
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    // Validate new password strength
    if (newPassword.length < 8) {
      throw AuthError.weakPassword();
    }

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AuthError.userNotFound();
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isOldPasswordValid) {
      throw AuthError.incorrectPassword();
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });
  }

  async enable2FA(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw AuthError.userNotFound();
    }

    if (user.twoFactorEnabled) {
      throw AuthError.twoFactorAlreadyEnabled();
    }

    const secret = generateTotpSecret();
    const encryptedSecret = encryptSecret(secret);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
      },
    });

    const encodedLabel = encodeURIComponent(user.email || userId);
    const otpauthUrl = `otpauth://totp/CryptoTax:${encodedLabel}?secret=${secret}&issuer=CryptoTax`;

    return { secret, otpauthUrl };
  }

  async refreshToken(oldToken: string): Promise<string> {
    try {
      const decoded = jwt.verify(oldToken, this.jwtSecret) as TokenPayload & {
        iat: number;
        exp: number;
      };

      // Verify user still exists
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        throw AuthError.userNotFound();
      }

      // Generate new token
      const newToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          planId: user.planId,
        } as TokenPayload,
        this.jwtSecret,
        { expiresIn: '7d' }
      );

      return newToken;
    } catch (error: any) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw AuthError.invalidToken();
    }
  }

  async verifyTwoFactorCode(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw AuthError.twoFactorNotEnabled();
    }

    const secret = decryptSecret(user.twoFactorSecret);
    return verifyTotp(secret, token);
  }

  private sanitizeUser(user: User): SanitizedUser {
    return {
      id: user.id,
      email: user.email,
      planId: user.planId,
      twoFactorEnabled: user.twoFactorEnabled,
    };
  }
}
