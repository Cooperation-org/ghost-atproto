/**
 * Authentication Middleware
 *
 * File: backend/src/middleware/auth.ts
 *
 * Usage:
 *   import { authenticateToken, requireAdmin, AuthRequest } from './middleware/auth';
 *
 *   app.get('/api/protected', authenticateToken, (req: AuthRequest, res) => {
 *     console.log(req.user.id); // Typed!
 *   });
 *
 *   app.get('/api/admin', authenticateToken, requireAdmin, (req: AuthRequest, res) => {
 *     // Only admins reach here
 *   });
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { ApiError } from '../lib/errors';

const prisma = new PrismaClient();

// =============================================================================
// Types
// =============================================================================

export interface UserPayload {
  id: string;
  email: string;
  role: 'USER' | 'AUTHOR' | 'ADMIN';
}

export interface AuthRequest extends Request {
  user: UserPayload;
  userId: string; // Legacy compatibility
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Verify JWT token and attach user to request
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get token from header or cookie
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1] || req.cookies?.token;

    if (!token) {
      throw ApiError.unauthorized('Authentication required');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('[Auth] JWT_SECRET not configured');
      throw ApiError.internal('Server configuration error');
    }

    // Verify token
    const decoded = jwt.verify(token, secret) as { userId: string };

    if (!decoded.userId) {
      throw ApiError.unauthorized('Invalid token');
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      throw ApiError.unauthorized('User not found');
    }

    // Attach user to request
    (req as AuthRequest).user = user as UserPayload;
    (req as AuthRequest).userId = user.id; // Legacy compatibility

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Invalid token',
        code: 'UNAUTHORIZED',
      });
      return;
    }
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
      return;
    }
    res.status(500).json({
      error: 'Authentication failed',
      code: 'INTERNAL_ERROR',
    });
  }
}

/**
 * Require admin role (must be used after authenticateToken)
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthRequest;

  if (!authReq.user) {
    res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  if (authReq.user.role !== 'ADMIN') {
    res.status(403).json({
      error: 'Admin access required',
      code: 'FORBIDDEN',
    });
    return;
  }

  next();
}

/**
 * Require author or admin role (must be used after authenticateToken)
 */
export function requireAuthor(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthRequest;

  if (!authReq.user) {
    res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  if (authReq.user.role !== 'AUTHOR' && authReq.user.role !== 'ADMIN') {
    res.status(403).json({
      error: 'Author access required',
      code: 'FORBIDDEN',
    });
    return;
  }

  next();
}

/**
 * Optional authentication - attaches user if token present, but doesn't fail
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1] || req.cookies?.token;

    if (!token) {
      next();
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      next();
      return;
    }

    const decoded = jwt.verify(token, secret) as { userId: string };

    if (decoded.userId) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          role: true,
        },
      });

      if (user) {
        (req as AuthRequest).user = user as UserPayload;
        (req as AuthRequest).userId = user.id;
      }
    }
  } catch {
    // Ignore errors - optional auth
  }

  next();
}
