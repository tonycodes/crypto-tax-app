import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';

const authService = new AuthService();

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const authenticateToken = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    const error = new Error('Access token is required') as AppError;
    error.statusCode = 401;
    error.isOperational = true;
    return next(error);
  }

  try {
    const decoded = authService.verifyToken(token);
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch (error) {
    const authError = new Error('Invalid or expired token') as AppError;
    authError.statusCode = 401;
    authError.isOperational = true;
    next(authError);
  }
};