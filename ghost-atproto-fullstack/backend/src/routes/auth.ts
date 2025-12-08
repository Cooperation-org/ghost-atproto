/**
 * Authentication Routes
 *
 * File: backend/src/routes/auth.ts
 *
 * Routes:
 *   POST /api/auth/login      - Email/password login
 *   POST /api/auth/signup     - Create new account
 *   POST /api/auth/logout     - Clear session
 *   GET  /api/auth/me         - Get current user
 *   PUT  /api/auth/me         - Update current user
 *   GET  /api/auth/oauth/config - Get OAuth providers config
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { ApiError, handleError } from '../lib/errors';

const router = Router();
const prisma = new PrismaClient();

// =============================================================================
// Helper Functions
// =============================================================================

function generateToken(userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  return jwt.sign({ userId }, secret, { expiresIn: '7d' });
}

function setTokenCookie(res: Response, token: string): void {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /api/auth/login
 * Email/password login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw ApiError.validation('Email and password are required');
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    // Check if user has password (might be OAuth-only)
    if (!user.password) {
      throw ApiError.unauthorized(
        'This account uses OAuth. Please sign in with Google or Bluesky.'
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const token = generateToken(user.id);
    setTokenCookie(res, token);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        blueskyHandle: user.blueskyHandle,
        ghostUrl: user.ghostUrl,
        shimUrl: user.shimUrl,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (error) {
    handleError(res, error, 'Login failed', 'auth/login');
  }
});

/**
 * POST /api/auth/signup
 * Create new account
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, role, name } = req.body;

    if (!email || !password) {
      throw ApiError.validation('Email and password are required');
    }

    if (password.length < 6) {
      throw ApiError.validation('Password must be at least 6 characters');
    }

    // Check if email exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      throw ApiError.conflict('Email already registered');
    }

    // Validate role
    const userRole = role || 'USER';
    if (!['USER', 'AUTHOR'].includes(userRole)) {
      throw ApiError.validation('Invalid role. Use USER or AUTHOR.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        role: userRole,
        name: name || null,
      },
    });

    const token = generateToken(user.id);
    setTokenCookie(res, token);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (error) {
    handleError(res, error, 'Signup failed', 'auth/signup');
  }
});

/**
 * POST /api/auth/logout
 * Clear session
 */
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw ApiError.notFound('User');
    }

    // Return masked version - sensitive fields show placeholder if configured
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      blueskyHandle: user.blueskyHandle,
      ghostUrl: user.ghostUrl,
      shimUrl: user.shimUrl,
      createdAt: user.createdAt,
      // Indicate if configured without exposing actual values
      blueskyPassword: user.blueskyPassword ? '••••••••' : null,
      ghostApiKey: user.ghostApiKey ? '••••••••' : null,
      ghostContentApiKey: user.ghostContentApiKey ? '••••••••' : null,
      shimSecret: user.shimSecret ? '••••••••' : null,
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch user', 'auth/me');
  }
});

/**
 * PUT /api/auth/me
 * Update current user profile
 */
router.put('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user.id;

    const {
      name,
      blueskyHandle,
      blueskyPassword,
      ghostUrl,
      ghostApiKey,
      ghostContentApiKey,
      shimUrl,
      shimSecret,
    } = req.body;

    // Build update data - only include fields that were provided
    const updateData: Record<string, string | null> = {};

    if (name !== undefined) updateData.name = name;
    if (blueskyHandle !== undefined) updateData.blueskyHandle = blueskyHandle;
    if (blueskyPassword !== undefined) updateData.blueskyPassword = blueskyPassword;
    if (ghostUrl !== undefined) updateData.ghostUrl = ghostUrl;
    if (ghostApiKey !== undefined) updateData.ghostApiKey = ghostApiKey;
    if (ghostContentApiKey !== undefined) updateData.ghostContentApiKey = ghostContentApiKey;
    if (shimUrl !== undefined) updateData.shimUrl = shimUrl;
    if (shimSecret !== undefined) updateData.shimSecret = shimSecret;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      blueskyHandle: user.blueskyHandle,
      ghostUrl: user.ghostUrl,
      shimUrl: user.shimUrl,
      createdAt: user.createdAt,
      blueskyPassword: user.blueskyPassword ? '••••••••' : null,
      ghostApiKey: user.ghostApiKey ? '••••••••' : null,
      ghostContentApiKey: user.ghostContentApiKey ? '••••••••' : null,
      shimSecret: user.shimSecret ? '••••••••' : null,
    });
  } catch (error) {
    handleError(res, error, 'Failed to update user', 'auth/me PUT');
  }
});

export default router;
