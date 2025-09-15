import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';

// Types for error handling
interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

interface ValidationError {
  error: string;
  details: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Creates and configures the Express application
 */
export async function createApp(): Promise<Express> {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));

  // CORS configuration
  app.use(cors({
    origin: process.env['NODE_ENV'] === 'production'
      ? ['https://yourdomain.com']
      : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] || '1.0.0',
      environment: process.env['NODE_ENV'] || 'development',
    });
  });

  // Test error endpoint (for testing error handling)
  app.get('/api/test-error', (_req: Request, _res: Response, next: NextFunction) => {
    const error = new Error('Test error for error handling') as AppError;
    error.statusCode = 500;
    next(error);
  });

  // API routes (to be implemented)
  app.use('/api/auth', createAuthRouter());
  app.use('/api/wallets', createWalletsRouter());
  app.use('/api/transactions', createTransactionsRouter());
  app.use('/api/reports', createReportsRouter());

  // 404 handler for unknown routes
  app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'Route not found',
      path: req.originalUrl,
    });
  });

  // Global error handler
  app.use((error: AppError, req: Request, res: Response, _next: NextFunction) => {
    // Log error
    console.error('Error:', {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
    });

    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      const zodError = error as any;
      const validationError: ValidationError = {
        error: 'Validation Error',
        details: zodError.errors.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      };
      return res.status(400).json(validationError);
    }

    // Handle operational errors
    if (error.isOperational) {
      return res.status(error.statusCode || 500).json({
        error: error.name || 'Operational Error',
        message: error.message,
      });
    }

    // Handle unexpected errors
    return res.status(500).json({
      error: 'Internal Server Error',
      message: process.env['NODE_ENV'] === 'production'
        ? 'Something went wrong'
        : error.message,
    });
  });

  return app;
}

// Placeholder route creators (to be implemented)
function createAuthRouter() {
  const router = express.Router();

  // POST /api/auth/register - for testing validation
  router.post('/register', (req: Request, res: Response, next: NextFunction) => {
    try {
      const registerSchema = z.object({
        email: z.string().email('Invalid email format'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
      });

      registerSchema.parse(req.body);

      // For now, just return success (actual implementation will come later)
      res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function createWalletsRouter() {
  return express.Router();
}

function createTransactionsRouter() {
  return express.Router();
}

function createReportsRouter() {
  return express.Router();
}