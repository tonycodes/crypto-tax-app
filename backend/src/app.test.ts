import request from 'supertest';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { createApp } from './app';
import { Express } from 'express';

describe('App', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp();
  });

  describe('Basic API', () => {
    it('should respond with 200 on health check', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        version: expect.any(String),
      });
    });

    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route').expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Route not found',
        path: '/unknown-route',
      });
    });

    it('should have security headers', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'x-xss-protection': '0',
      });
    });

    it('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/auth/register')
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

    it('should handle internal server errors', async () => {
      // This will be implemented when we have routes that can error
      const response = await request(app).get('/api/test-error').expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: expect.any(String),
      });
    });
  });
});
