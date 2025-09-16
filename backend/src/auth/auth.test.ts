import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createApp } from '../app';
import { Express } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { generateTotp } from './totp.util';

describe('Authentication', () => {
  let app: Express;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await createApp();
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear all users after each test to prevent conflicts
    await prisma.user.deleteMany();

    // Ensure basic plan exists
    await prisma.plan.upsert({
      where: { id: 'basic' },
      update: {},
      create: {
        id: 'basic',
        name: 'BASIC',
        monthlyPriceUSD: 0,
        features: ['1 blockchain', '100 transactions/month', 'Basic reports'],
        chainLimit: 1,
        transactionLimit: 100,
        hasAIHealing: false,
        hasAdvancedReports: false,
        isActive: true,
      },
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'securePassword123',
      };

      const response = await request(app).post('/api/auth/register').send(userData).expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        email: 'test@example.com',
        planId: 'basic',
        twoFactorEnabled: false,
      });

      // Verify user was created in database
      const user = await prisma.user.findUnique({
        where: { email: 'test@example.com' },
      });
      expect(user).toBeTruthy();
      expect(user?.email).toBe('test@example.com');
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'securePassword123',
      };

      const response = await request(app).post('/api/auth/register').send(userData).expect(400);

      expect(response.body).toMatchObject({
        error: 'Validation Error',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: expect.stringContaining('Invalid email'),
          }),
        ]),
      });
    });

    it('should reject registration with weak password', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123',
      };

      const response = await request(app).post('/api/auth/register').send(userData).expect(400);

      expect(response.body).toMatchObject({
        error: 'Validation Error',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'password',
            message: expect.stringContaining('at least 8 characters'),
          }),
        ]),
      });
    });

    it('should reject duplicate email registration', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'securePassword123',
      };

      // First registration should succeed
      await request(app).post('/api/auth/register').send(userData).expect(201);

      // Second registration with same email should fail
      const response = await request(app).post('/api/auth/register').send(userData).expect(409);

      expect(response.body).toMatchObject({
        error: 'Conflict',
        message: 'Email already registered',
      });
    });
  });

  describe('POST /api/auth/login', () => {
    const testUser = {
      email: 'login-test@example.com',
      password: 'securePassword123',
    };

    beforeEach(async () => {
      // Register a test user before each login test
      await request(app).post('/api/auth/register').send(testUser);
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        user: {
          id: expect.any(String),
          email: testUser.email,
          planId: 'basic',
          twoFactorEnabled: false,
        },
        token: expect.any(String),
      });

      // Verify JWT token is valid
      const decoded = jwt.verify(
        response.body.token,
        process.env['JWT_SECRET'] || 'default_secret_change_in_production'
      ) as any;
      expect(decoded.userId).toBe(response.body.user.id);
      expect(decoded.email).toBe(testUser.email);
    });

    it('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongPassword',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'anyPassword123',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    });

    it('should validate login input format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: '123', // Too short
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Validation Error',
        details: expect.any(Array),
      });
    });
  });

  describe('Two-factor authentication flow', () => {
    const userData = {
      email: '2fa-user@example.com',
      password: 'SecurePassword123',
    };

    let authToken: string;
    let sharedSecret: string;

    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(userData).expect(201);

      const loginResponse = await request(app).post('/api/auth/login').send(userData).expect(200);

      authToken = loginResponse.body.token;
    });

    it('enables 2FA and requires tokens on subsequent login', async () => {
      const setupResponse = await request(app)
        .post('/api/auth/twofactor/setup')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(setupResponse.body).toMatchObject({
        secret: expect.any(String),
        otpauthUrl: expect.stringContaining('otpauth://totp/CryptoTax:'),
      });

      sharedSecret = setupResponse.body.secret;

      const verifyResponse = await request(app)
        .post('/api/auth/twofactor/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: generateTotp(sharedSecret) })
        .expect(200);

      expect(verifyResponse.body).toEqual({ success: true });

      await request(app)
        .post('/api/auth/login')
        .send(userData)
        .expect(401)
        .expect(res => {
          expect(res.body).toMatchObject({
            error: 'Unauthorized',
            message: 'Two-factor authentication token is required',
          });
        });

      const loginWithTotp = await request(app)
        .post('/api/auth/login')
        .send({ ...userData, twoFactorToken: generateTotp(sharedSecret) })
        .expect(200);

      expect(loginWithTotp.body.user).toMatchObject({
        email: userData.email,
        twoFactorEnabled: true,
      });
    });
  });

  describe('JWT Token Authentication', () => {
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
      // Register and get a token for protected route tests
      await request(app).post('/api/auth/register').send({
        email: 'jwt-test@example.com',
        password: 'securePassword123',
      });

      // Login to get token
      const loginResponse = await request(app).post('/api/auth/login').send({
        email: 'jwt-test@example.com',
        password: 'securePassword123',
      });

      userToken = loginResponse.body.token;
      userId = loginResponse.body.user.id;
    });

    it('should access protected route with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        user: {
          id: userId,
          email: 'jwt-test@example.com',
        },
      });
    });

    it('should reject access to protected route without token', async () => {
      const response = await request(app).get('/api/auth/profile').expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Access token is required',
      });
    });

    it('should reject access with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    });

    it('should reject access with expired token', async () => {
      // Create an expired token (1 second expiry in the past)
      const expiredToken = jwt.sign(
        { userId, email: 'jwt-test@example.com', planId: 'basic' },
        process.env['JWT_SECRET'] || 'default_secret_change_in_production',
        { expiresIn: '-1s' }
      );

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Token expired',
      });
    });
  });

  describe('Password Hashing', () => {
    it('should hash passwords properly during registration', async () => {
      const userData = {
        email: 'hash-test@example.com',
        password: 'testPassword123',
      };

      await request(app).post('/api/auth/register').send(userData).expect(201);

      // The stored password should be hashed, not plain text
      // Verify the login works with the original password
      const loginResponse = await request(app).post('/api/auth/login').send(userData).expect(200);

      expect(loginResponse.body.token).toBeDefined();

      // Verify password is actually hashed in database
      const user = await prisma.user.findUnique({
        where: { email: userData.email },
      });
      expect(user?.passwordHash).not.toBe(userData.password);
      expect(user?.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt hash pattern
    });
  });

  describe('Auth Middleware Integration', () => {
    let userToken: string;

    beforeEach(async () => {
      await request(app).post('/api/auth/register').send({
        email: 'middleware-test@example.com',
        password: 'securePassword123',
      });

      const loginResponse = await request(app).post('/api/auth/login').send({
        email: 'middleware-test@example.com',
        password: 'securePassword123',
      });

      userToken = loginResponse.body.token;
    });

    it('should allow access to protected routes with valid token', async () => {
      // Test accessing a protected wallet endpoint
      const response = await request(app)
        .get('/api/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should reject access to protected routes without proper authorization', async () => {
      const response = await request(app).get('/api/wallets').expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: expect.any(String),
      });
    });
  });
});
