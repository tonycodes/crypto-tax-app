import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AuthService } from './auth.service';
import { PrismaClient } from '@prisma/client';

// Mock modules
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    hash: jest.fn(() => Promise.resolve('hashed_password')),
    compare: jest.fn(() => Promise.resolve(true)),
    hashSync: jest.fn(() => 'hashed_password'),
    compareSync: jest.fn(() => true),
  },
}));

jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    sign: jest.fn(() => 'jwt_token'),
    verify: jest.fn(() => ({ userId: 'user123', email: 'test@example.com', planId: 'basic' })),
    decode: jest.fn(() => ({ userId: 'user123', email: 'test@example.com' })),
  },
}));
jest.mock('./crypto.util', () => ({
  encryptSecret: jest.fn((secret: string) => `enc:${secret}`),
  decryptSecret: jest.fn((payload: string) => payload.replace(/^enc:/, '')),
}));
jest.mock('./totp.util', () => ({
  generateTotpSecret: jest.fn(() => 'JBSWY3DPEHPK3PXP'),
  verifyTotp: jest.fn(() => true),
}));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    plan: {
      findUnique: jest.fn(),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

// Import mocked modules after jest.mock
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { encryptSecret, decryptSecret } from './crypto.util';
import { generateTotpSecret, verifyTotp } from './totp.util';

const mockedBcrypt = bcrypt as any;
const mockedJwt = jwt as any;
const mockedEncryptSecret = encryptSecret as jest.Mock;
const mockedDecryptSecret = decryptSecret as jest.Mock;
const mockedGenerateTotpSecret = generateTotpSecret as jest.Mock;
const mockedVerifyTotp = verifyTotp as jest.Mock;

describe('AuthService', () => {
  let authService: AuthService;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = new PrismaClient();
    authService = new AuthService(mockPrisma);
    mockedEncryptSecret.mockClear();
    mockedDecryptSecret.mockClear();
    mockedGenerateTotpSecret.mockClear();
    mockedVerifyTotp.mockClear();
  });

  describe('register', () => {
    it('should register a new user with basic plan', async () => {
      const email = 'new@example.com';
      const password = 'SecurePass123!';
      const hashedPassword = 'hashed_password';

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.plan.findUnique.mockResolvedValue({ id: 'basic' });
      mockedBcrypt.hash.mockResolvedValue(hashedPassword);

      mockPrisma.user.create.mockResolvedValue({
        id: 'user123',
        email,
        passwordHash: hashedPassword,
        planId: 'basic',
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authService.register(email, password);

      expect(result).toMatchObject({
        id: 'user123',
        email,
        planId: 'basic',
        twoFactorEnabled: false,
      });
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, 10);
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should throw error if email already exists', async () => {
      const email = 'existing@example.com';
      const password = 'password123';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existing_user',
        email,
      });

      await expect(authService.register(email, password)).rejects.toThrow(
        'Email already registered'
      );
    });

    it('should validate email format', async () => {
      const invalidEmail = 'not-an-email';
      const password = 'password123';

      await expect(authService.register(invalidEmail, password)).rejects.toThrow(
        'Invalid email format'
      );
    });

    it('should validate password strength', async () => {
      const email = 'test@example.com';
      const weakPassword = '123';

      await expect(authService.register(email, weakPassword)).rejects.toThrow(
        'Password must be at least 8 characters'
      );
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const email = 'user@example.com';
      const password = 'password123';
      const hashedPassword = 'hashed_password';
      const token = 'jwt_token';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        email,
        passwordHash: hashedPassword,
        planId: 'basic',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        plan: {
          id: 'basic',
          name: 'BASIC',
          features: ['1 chain'],
        },
      });

      mockedBcrypt.compare.mockResolvedValue(true);
      mockedJwt.sign.mockReturnValue(token);

      const result = await authService.login(email, password);

      expect(result).toMatchObject({
        user: {
          id: 'user123',
          email,
          twoFactorEnabled: false,
        },
        token,
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(mockedJwt.sign).toHaveBeenCalled();
    });

    it('should throw error for invalid email', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.login(email, password)).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for invalid password', async () => {
      const email = 'user@example.com';
      const password = 'wrong_password';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        email,
        passwordHash: 'hashed_password',
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      mockedBcrypt.compare.mockResolvedValue(false);

      await expect(authService.login(email, password)).rejects.toThrow('Invalid email or password');
    });

    it('should require two-factor token when enabled', async () => {
      const email = 'user@example.com';
      const password = 'password123';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        email,
        passwordHash: 'hashed_password',
        planId: 'basic',
        twoFactorEnabled: true,
        twoFactorSecret: 'enc:JBSWY3DPEHPK3PXP',
      });

      mockedBcrypt.compare.mockResolvedValue(true);

      await expect(authService.login(email, password)).rejects.toThrow(
        'Two-factor authentication token is required'
      );
    });

    it('should validate two-factor token', async () => {
      const email = 'user@example.com';
      const password = 'password123';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        email,
        passwordHash: 'hashed_password',
        planId: 'basic',
        twoFactorEnabled: true,
        twoFactorSecret: 'enc:JBSWY3DPEHPK3PXP',
      });

      mockedBcrypt.compare.mockResolvedValue(true);
      mockedJwt.sign.mockReturnValue('jwt_token');
      mockedVerifyTotp.mockReturnValueOnce(true);

      const result = await authService.login(email, password, {
        twoFactorToken: '123456',
      });

      expect(mockedDecryptSecret).toHaveBeenCalledWith('enc:JBSWY3DPEHPK3PXP');
      expect(mockedVerifyTotp).toHaveBeenCalled();
      expect(result.user.twoFactorEnabled).toBe(true);
    });

    it('should reject invalid two-factor token', async () => {
      const email = 'user@example.com';
      const password = 'password123';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        email,
        passwordHash: 'hashed_password',
        planId: 'basic',
        twoFactorEnabled: true,
        twoFactorSecret: 'enc:JBSWY3DPEHPK3PXP',
      });

      mockedBcrypt.compare.mockResolvedValue(true);
      mockedVerifyTotp.mockReturnValueOnce(false);

      await expect(
        authService.login(email, password, { twoFactorToken: '123456' })
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid JWT token', async () => {
      const token = 'valid_token';
      const decoded = {
        userId: 'user123',
        email: 'user@example.com',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      };

      mockedJwt.verify.mockReturnValue(decoded);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: 'user@example.com',
        planId: 'basic',
      });

      const result = await authService.verifyToken(token);

      expect(result).toMatchObject({
        userId: 'user123',
        email: 'user@example.com',
      });
      expect(mockedJwt.verify).toHaveBeenCalledWith(token, expect.any(String));
    });

    it('should throw error for invalid token', async () => {
      const token = 'invalid_token';

      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.verifyToken(token)).rejects.toThrow('Invalid token');
    });

    it('should throw error for expired token', async () => {
      const token = 'expired_token';

      mockedJwt.verify.mockImplementation(() => {
        const error = new Error('jwt expired') as any;
        error.name = 'TokenExpiredError';
        throw error;
      });

      await expect(authService.verifyToken(token)).rejects.toThrow('Token expired');
    });
  });

  describe('changePassword', () => {
    it('should change password for valid user', async () => {
      const userId = 'user123';
      const oldPassword = 'old_password';
      const newPassword = 'NewSecurePass123!';
      const oldHash = 'old_hash';
      const newHash = 'new_hash';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        passwordHash: oldHash,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      mockedBcrypt.compare.mockResolvedValue(true);
      mockedBcrypt.hash.mockResolvedValue(newHash);

      mockPrisma.user.update.mockResolvedValue({
        id: userId,
        passwordHash: newHash,
      });

      await authService.changePassword(userId, oldPassword, newPassword);

      expect(mockedBcrypt.compare).toHaveBeenCalledWith(oldPassword, oldHash);
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(newPassword, 10);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { passwordHash: newHash },
      });
    });

    it('should throw error for incorrect old password', async () => {
      const userId = 'user123';
      const oldPassword = 'wrong_password';
      const newPassword = 'new_password';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        passwordHash: 'hash',
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      mockedBcrypt.compare.mockResolvedValue(false);

      await expect(authService.changePassword(userId, oldPassword, newPassword)).rejects.toThrow(
        'Incorrect password'
      );
    });

    it('should enforce password strength for new password', async () => {
      const userId = 'user123';
      const oldPassword = 'old_password';
      const weakNewPassword = '123';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        passwordHash: 'hash',
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      mockedBcrypt.compare.mockResolvedValue(true);

      await expect(
        authService.changePassword(userId, oldPassword, weakNewPassword)
      ).rejects.toThrow('Password must be at least 8 characters');
    });
  });

  describe('enable2FA', () => {
    it('should enable 2FA for user', async () => {
      const userId = 'user123';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'user@example.com',
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });
      mockPrisma.user.update.mockResolvedValue({
        id: userId,
        twoFactorEnabled: true,
        twoFactorSecret: 'enc:JBSWY3DPEHPK3PXP',
      });

      const result = await authService.enable2FA(userId);

      expect(result).toMatchObject({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: expect.stringContaining('otpauth://totp/CryptoTax:'),
      });
      expect(mockedEncryptSecret).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining({
          twoFactorEnabled: true,
          twoFactorSecret: expect.stringMatching(/^enc:/),
        }),
      });
    });
  });

  describe('verifyTwoFactorCode', () => {
    it('should verify code when 2FA is enabled', async () => {
      const userId = 'user123';

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        twoFactorEnabled: true,
        twoFactorSecret: 'enc:JBSWY3DPEHPK3PXP',
      });
      mockedVerifyTotp.mockReturnValueOnce(true);

      const result = await authService.verifyTwoFactorCode(userId, '123456');

      expect(mockedDecryptSecret).toHaveBeenCalledWith('enc:JBSWY3DPEHPK3PXP');
      expect(mockedVerifyTotp).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should throw error when 2FA is not enabled', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      await expect(authService.verifyTwoFactorCode('user123', '123456')).rejects.toThrow(
        'Two-factor authentication is not enabled'
      );
    });
  });

  describe('refreshToken', () => {
    it('should generate new token for valid refresh token', async () => {
      const oldToken = 'old_token';
      const newToken = 'new_token';
      const decoded = {
        userId: 'user123',
        email: 'user@example.com',
        iat: Date.now() / 1000 - 1800, // 30 minutes ago
        exp: Date.now() / 1000 + 1800, // 30 minutes from now
      };

      mockedJwt.verify.mockReturnValue(decoded);
      mockedJwt.sign.mockReturnValue(newToken as any);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user123',
        email: 'user@example.com',
        planId: 'basic',
      });

      const result = await authService.refreshToken(oldToken);

      expect(result).toBe(newToken);
      expect(mockedJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          email: 'user@example.com',
        }),
        expect.any(String),
        expect.objectContaining({ expiresIn: '7d' })
      );
    });

    it('should throw error for invalid refresh token', async () => {
      const token = 'invalid_token';

      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken(token)).rejects.toThrow('Invalid token');
    });
  });
});
