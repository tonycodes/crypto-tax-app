import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { PrismaClient } from '@prisma/client';
import { AuthError } from './auth.errors';

const prisma = new PrismaClient();
const authService = new AuthService(prisma);

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const authenticateToken = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    const error = new Error('Access token is required') as AppError;
    error.statusCode = 401;
    error.isOperational = true;
    return next(error);
  }

  try {
    const decoded = await authService.verifyToken(token);
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch (error) {
    if (error instanceof AuthError) {
      const authError = new Error(error.message) as AppError;
      authError.statusCode = error.statusCode;
      authError.isOperational = true;
      authError.name = 'Unauthorized';
      return next(authError);
    }

    const genericError = new Error('Invalid or expired token') as AppError;
    genericError.statusCode = 401;
    genericError.isOperational = true;
    next(genericError);
  }
};
