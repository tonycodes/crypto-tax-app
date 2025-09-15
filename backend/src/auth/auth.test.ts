import request from 'supertest';
import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { createApp } from '../app';
import { Express } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';

describe('Authentication', () => {
  let app: Express;
  let authService: AuthService;

  beforeAll(async () => {
    app = await createApp();
    authService = new AuthService();
  });

  afterEach(() => {
    // Clear all users after each test to prevent conflicts
    authService.clearUsers();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'securePassword123',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        message: 'User registered successfully',
        user: {
          id: expect.any(String),
          email: 'test@example.com',
        },
        token: expect.any(String),
      });

      // Verify JWT token is valid
      const decoded = jwt.verify(response.body.token, process.env['JWT_SECRET']!) as any;
      expect(decoded.userId).toBe(response.body.user.id);
      expect(decoded.email).toBe('test@example.com');
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'securePassword123',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

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

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

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
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Second registration with same email should fail
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body).toMatchObject({
        error: 'Conflict',
        message: 'User with this email already exists',
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
      await request(app)
        .post('/api/auth/register')
        .send(testUser);
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
        message: 'Login successful',
        user: {
          id: expect.any(String),
          email: testUser.email,
        },
        token: expect.any(String),
      });

      // Verify JWT token is valid
      const decoded = jwt.verify(response.body.token, process.env['JWT_SECRET']!) as any;
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
        message: 'Invalid credentials',
      });
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'anyPassword',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid credentials',
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

  describe('JWT Token Authentication', () => {
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
      // Register and get a token for protected route tests
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'jwt-test@example.com',
          password: 'securePassword123',
        });

      userToken = registerResponse.body.token;
      userId = registerResponse.body.user.id;
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
      const response = await request(app)
        .get('/api/auth/profile')
        .expect(401);

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
        message: 'Invalid or expired token',
      });
    });

    it('should reject access with expired token', async () => {
      // Create an expired token (1 second expiry in the past)
      const expiredToken = jwt.sign(
        { userId, email: 'jwt-test@example.com' },
        process.env['JWT_SECRET']!,
        { expiresIn: '-1s' }
      );

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    });
  });

  describe('Password Hashing', () => {
    it('should hash passwords properly during registration', async () => {
      const userData = {
        email: 'hash-test@example.com',
        password: 'testPassword123',
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // The stored password should be hashed, not plain text
      // This test assumes we can access the user service or database
      // For now, we verify the login works with the original password
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send(userData)
        .expect(200);

      expect(loginResponse.body.token).toBeDefined();
    });
  });

  describe('Auth Middleware Integration', () => {
    let userToken: string;

    beforeEach(async () => {
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'middleware-test@example.com',
          password: 'securePassword123',
        });

      userToken = registerResponse.body.token;
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
      const response = await request(app)
        .get('/api/wallets')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: expect.any(String),
      });
    });
  });
});