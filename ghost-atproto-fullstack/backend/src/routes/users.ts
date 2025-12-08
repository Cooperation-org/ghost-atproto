/**
 * User Management Routes (Admin)
 *
 * File: backend/src/routes/users.ts
 *
 * Routes:
 *   GET    /api/users      - List all users (admin)
 *   POST   /api/users      - Create user (admin)
 *   GET    /api/users/:id  - Get user by ID (admin)
 *   PUT    /api/users/:id  - Update user (admin)
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth';
import { ApiError, handleError } from '../lib/errors';

const router = Router();
const prisma = new PrismaClient();

// All routes require admin access
router.use(authenticateToken, requireAdmin);

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/users
 * List all users (admin only)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        blueskyHandle: true,
        ghostUrl: true,
        shimUrl: true,
        createdAt: true,
        _count: {
          select: {
            posts: true,
            syncLogs: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(users);
  } catch (error) {
    handleError(res, error, 'Failed to fetch users', 'users/list');
  }
});

/**
 * POST /api/users
 * Create new user (admin only)
 */
router.post('/', async (req: Request, res: Response) => {
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

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        role: role || 'USER',
        name: name || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    handleError(res, error, 'Failed to create user', 'users/create');
  }
});

/**
 * GET /api/users/:id
 * Get user by ID (admin only)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        blueskyHandle: true,
        ghostUrl: true,
        shimUrl: true,
        createdAt: true,
        _count: {
          select: {
            posts: true,
            syncLogs: true,
            civicActions: true,
            engagements: true,
          },
        },
      },
    });

    if (!user) {
      throw ApiError.notFound('User');
    }

    res.json(user);
  } catch (error) {
    handleError(res, error, 'Failed to fetch user', 'users/get');
  }
});

/**
 * PUT /api/users/:id
 * Update user (admin only)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, password, blueskyHandle, ghostUrl, shimUrl } = req.body;

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (blueskyHandle !== undefined) updateData.blueskyHandle = blueskyHandle;
    if (ghostUrl !== undefined) updateData.ghostUrl = ghostUrl;
    if (shimUrl !== undefined) updateData.shimUrl = shimUrl;

    // Hash password if provided
    if (password) {
      if (password.length < 6) {
        throw ApiError.validation('Password must be at least 6 characters');
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        blueskyHandle: true,
        ghostUrl: true,
        shimUrl: true,
        createdAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    handleError(res, error, 'Failed to update user', 'users/update');
  }
});

export default router;
