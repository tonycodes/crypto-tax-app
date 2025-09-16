import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { AuthService } from './auth/auth.service';
import { authenticateToken } from './auth/auth.middleware';
import { PrismaClient } from '@prisma/client';
import { AuthError } from './auth/auth.errors';

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
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin:
        process.env['NODE_ENV'] === 'production'
          ? ['https://yourdomain.com']
          : ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      const errorName =
        error.name && error.name !== 'Error'
          ? error.name
          : error.statusCode === 401
            ? 'Unauthorized'
            : error.statusCode === 404
              ? 'Not Found'
              : error.statusCode === 409
                ? 'Conflict'
                : 'Operational Error';

      return res.status(error.statusCode || 500).json({
        error: errorName,
        message: error.message,
      });
    }

    // Handle unexpected errors
    return res.status(500).json({
      error: 'Internal Server Error',
      message: process.env['NODE_ENV'] === 'production' ? 'Something went wrong' : error.message,
    });
  });

  return app;
}

// Auth router with full implementation
function createAuthRouter() {
  const router = express.Router();
  const prisma = new PrismaClient();
  const authService = new AuthService(prisma);

  const mapAuthErrorToAppError = (error: AuthError): AppError => {
    const appError = new Error(error.message) as AppError;
    appError.statusCode = error.statusCode;
    appError.isOperational = true;

    if (error.statusCode === 401) {
      appError.name = 'Unauthorized';
    } else if (error.statusCode === 409) {
      appError.name = 'Conflict';
    } else if (error.statusCode === 404) {
      appError.name = 'Not Found';
    } else if (error.statusCode === 400) {
      appError.name = 'Validation Error';
    } else {
      appError.name = 'Operational Error';
    }

    return appError;
  };

  // Registration endpoint
  router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const registerSchema = z.object({
        email: z.string().email('Invalid email format'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
      });

      const validatedData = registerSchema.parse(req.body);
      const result = await authService.register(validatedData.email, validatedData.password);

      res.status(201).json(result);
    } catch (error: any) {
      if (error instanceof AuthError) {
        return next(mapAuthErrorToAppError(error));
      }
      next(error);
    }
  });

  // Login endpoint
  router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loginSchema = z.object({
        email: z.string().email('Invalid email format'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        twoFactorToken: z
          .string()
          .regex(/^[0-9]{6}$/)
          .optional(),
      });

      const validatedData = loginSchema.parse(req.body);
      const loginOptions =
        validatedData.twoFactorToken !== undefined
          ? { twoFactorToken: validatedData.twoFactorToken }
          : undefined;

      const result = await authService.login(
        validatedData.email,
        validatedData.password,
        loginOptions
      );

      res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof AuthError) {
        return next(mapAuthErrorToAppError(error));
      }
      next(error);
    }
  });

  router.post(
    '/twofactor/setup',
    authenticateToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.enable2FA(req.user?.userId || '');
        res.status(200).json(result);
      } catch (error: any) {
        if (error instanceof AuthError) {
          return next(mapAuthErrorToAppError(error));
        }
        next(error);
      }
    }
  );

  router.post(
    '/twofactor/verify',
    authenticateToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const verifySchema = z.object({
          token: z
            .string()
            .regex(/^[0-9]{6}$/)
            .min(6)
            .max(6),
        });

        const { token } = verifySchema.parse(req.body);
        await authService.verifyTwoFactorCode(req.user?.userId || '', token);
        res.status(200).json({ success: true });
      } catch (error: any) {
        if (error instanceof AuthError) {
          return next(mapAuthErrorToAppError(error));
        }
        next(error);
      }
    }
  );

  // Profile endpoint (protected)
  router.get(
    '/profile',
    authenticateToken,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: req.user?.userId || '' },
          select: { id: true, email: true, twoFactorEnabled: true },
        });
        if (!user) {
          const notFoundError = new Error('User not found') as AppError;
          notFoundError.statusCode = 404;
          notFoundError.isOperational = true;
          return next(notFoundError);
        }

        res.status(200).json({
          user: {
            id: user.id,
            email: user.email,
            twoFactorEnabled: user.twoFactorEnabled,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

function createWalletsRouter() {
  const router = express.Router();

  // All wallet routes require authentication
  router.use(authenticateToken);

  // GET /api/wallets - Get user's wallets
  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // For now, return empty array (actual implementation will come later)
      res.status(200).json({
        wallets: [],
        message: 'Wallets retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function createTransactionsRouter() {
  return express.Router();
}

function createReportsRouter() {
  return express.Router();
}
