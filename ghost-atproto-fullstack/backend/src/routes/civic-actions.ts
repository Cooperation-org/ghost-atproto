/**
 * Civic Actions Routes
 *
 * File: backend/src/routes/civic-actions.ts
 *
 * Routes:
 *   GET    /api/public/civic-actions      - List approved actions (public)
 *   GET    /api/public/civic-actions/:id  - Get approved action (public)
 *   GET    /api/civic-actions             - List actions (filtered by role)
 *   GET    /api/civic-actions/mine        - List user's own actions
 *   GET    /api/civic-actions/:id         - Get action by ID
 *   POST   /api/civic-actions             - Create new action
 *   PUT    /api/civic-actions/:id         - Update action
 *   POST   /api/civic-actions/:id/approve - Approve action (admin)
 *   POST   /api/civic-actions/:id/reject  - Reject action (admin)
 *   POST   /api/civic-actions/:id/toggle-pin - Toggle pin (admin)
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireAdmin, optionalAuth, AuthRequest } from '../middleware/auth';
import { ApiError, handleError } from '../lib/errors';

const router = Router();
const prisma = new PrismaClient();

// =============================================================================
// Public Routes (no auth required)
// =============================================================================

/**
 * GET /api/public/civic-actions
 * List approved civic actions
 */
router.get('/public/civic-actions', async (_req: Request, res: Response) => {
  try {
    const actions = await prisma.civicAction.findMany({
      where: { status: 'approved' },
      orderBy: [
        { isPinned: 'desc' },
        { priority: 'desc' },
        { eventDate: 'asc' },
      ],
      include: {
        _count: {
          select: { engagements: true },
        },
      },
    });

    res.json(
      actions.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        eventType: a.eventType,
        eventDate: a.eventDate,
        location: a.location,
        imageUrl: a.imageUrl,
        externalUrl: a.externalUrl,
        source: a.source,
        status: a.status,
        isPinned: a.isPinned,
        priority: a.priority,
        engagementCount: a._count.engagements,
      }))
    );
  } catch (error) {
    handleError(res, error, 'Failed to fetch civic actions', 'civic-actions/public');
  }
});

/**
 * GET /api/public/civic-actions/:id
 * Get approved civic action by ID
 */
router.get('/public/civic-actions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const action = await prisma.civicAction.findUnique({
      where: { id },
      include: {
        _count: {
          select: { engagements: true },
        },
      },
    });

    if (!action) {
      throw ApiError.notFound('Civic action');
    }

    if (action.status !== 'approved') {
      throw ApiError.notFound('Civic action');
    }

    res.json({
      id: action.id,
      title: action.title,
      description: action.description,
      eventType: action.eventType,
      eventDate: action.eventDate,
      location: action.location,
      imageUrl: action.imageUrl,
      externalUrl: action.externalUrl,
      source: action.source,
      status: action.status,
      isPinned: action.isPinned,
      engagementCount: action._count.engagements,
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch civic action', 'civic-actions/public/:id');
  }
});

// =============================================================================
// Authenticated Routes
// =============================================================================

/**
 * GET /api/civic-actions
 * List civic actions (admins see all, users see approved)
 */
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const isAdmin = authReq.user?.role === 'ADMIN';
    const statusFilter = req.query.status as string | undefined;

    let where: Record<string, unknown> = {};

    if (isAdmin && statusFilter) {
      where.status = statusFilter;
    } else if (!isAdmin) {
      where.status = 'approved';
    }

    const actions = await prisma.civicAction.findMany({
      where,
      orderBy: [
        { isPinned: 'desc' },
        { priority: 'desc' },
        { eventDate: 'asc' },
      ],
      include: {
        _count: {
          select: { engagements: true },
        },
      },
    });

    res.json(
      actions.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        eventType: a.eventType,
        eventDate: a.eventDate,
        location: a.location,
        imageUrl: a.imageUrl,
        externalUrl: a.externalUrl,
        source: a.source,
        status: a.status,
        isPinned: a.isPinned,
        priority: a.priority,
        engagementCount: a._count.engagements,
      }))
    );
  } catch (error) {
    handleError(res, error, 'Failed to fetch civic actions', 'civic-actions/list');
  }
});

/**
 * GET /api/civic-actions/mine
 * List user's own civic actions
 */
router.get('/mine', authenticateToken, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;

    const actions = await prisma.civicAction.findMany({
      where: { userId: authReq.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { engagements: true },
        },
      },
    });

    res.json(
      actions.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        eventType: a.eventType,
        eventDate: a.eventDate,
        location: a.location,
        imageUrl: a.imageUrl,
        status: a.status,
        isPinned: a.isPinned,
        engagementCount: a._count.engagements,
      }))
    );
  } catch (error) {
    handleError(res, error, 'Failed to fetch your civic actions', 'civic-actions/mine');
  }
});

/**
 * GET /api/civic-actions/:id
 * Get civic action by ID
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;

    const action = await prisma.civicAction.findUnique({
      where: { id },
      include: {
        _count: {
          select: { engagements: true },
        },
      },
    });

    if (!action) {
      throw ApiError.notFound('Civic action');
    }

    // Non-admins can only see their own pending actions or approved actions
    const isAdmin = authReq.user?.role === 'ADMIN';
    const isOwner = authReq.user?.id === action.userId;

    if (action.status !== 'approved' && !isAdmin && !isOwner) {
      throw ApiError.notFound('Civic action');
    }

    res.json({
      id: action.id,
      title: action.title,
      description: action.description,
      eventType: action.eventType,
      eventDate: action.eventDate,
      location: action.location,
      imageUrl: action.imageUrl,
      externalUrl: action.externalUrl,
      source: action.source,
      status: action.status,
      isPinned: action.isPinned,
      engagementCount: action._count.engagements,
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch civic action', 'civic-actions/:id');
  }
});

/**
 * POST /api/civic-actions
 * Create new civic action
 */
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { title, description, eventType, eventDate, location, imageUrl } = req.body;

    if (!title || !description) {
      throw ApiError.validation('Title and description are required');
    }

    const action = await prisma.civicAction.create({
      data: {
        title,
        description,
        eventType,
        eventDate: eventDate ? new Date(eventDate) : null,
        location,
        imageUrl,
        status: 'pending',
        source: 'user_submitted',
        userId: authReq.user.id,
      },
    });

    res.status(201).json({
      id: action.id,
      title: action.title,
      description: action.description,
      eventType: action.eventType,
      eventDate: action.eventDate,
      location: action.location,
      imageUrl: action.imageUrl,
      status: action.status,
    });
  } catch (error) {
    handleError(res, error, 'Failed to create civic action', 'civic-actions/create');
  }
});

/**
 * PUT /api/civic-actions/:id
 * Update civic action (owner can edit pending, admin can edit any)
 */
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const { title, description, eventType, eventDate, location, imageUrl } = req.body;

    const action = await prisma.civicAction.findUnique({
      where: { id },
    });

    if (!action) {
      throw ApiError.notFound('Civic action');
    }

    const isAdmin = authReq.user.role === 'ADMIN';
    const isOwner = authReq.user.id === action.userId;

    if (!isAdmin && !isOwner) {
      throw ApiError.forbidden('Access denied');
    }

    // Non-admins can only edit pending actions
    if (!isAdmin && action.status !== 'pending') {
      throw ApiError.badRequest('Only pending actions can be edited');
    }

    const updated = await prisma.civicAction.update({
      where: { id },
      data: {
        title: title || action.title,
        description: description || action.description,
        eventType: eventType !== undefined ? eventType : action.eventType,
        eventDate: eventDate ? new Date(eventDate) : action.eventDate,
        location: location !== undefined ? location : action.location,
        imageUrl: imageUrl !== undefined ? imageUrl : action.imageUrl,
      },
    });

    res.json({
      id: updated.id,
      title: updated.title,
      description: updated.description,
      eventType: updated.eventType,
      eventDate: updated.eventDate,
      location: updated.location,
      imageUrl: updated.imageUrl,
      status: updated.status,
    });
  } catch (error) {
    handleError(res, error, 'Failed to update civic action', 'civic-actions/update');
  }
});

// =============================================================================
// Admin Routes
// =============================================================================

/**
 * POST /api/civic-actions/:id/approve
 * Approve civic action (admin only)
 */
router.post('/:id/approve', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pinned } = req.body;

    const action = await prisma.civicAction.update({
      where: { id },
      data: {
        status: 'approved',
        isPinned: !!pinned,
      },
    });

    res.json({
      id: action.id,
      title: action.title,
      status: action.status,
      isPinned: action.isPinned,
    });
  } catch (error) {
    handleError(res, error, 'Failed to approve civic action', 'civic-actions/approve');
  }
});

/**
 * POST /api/civic-actions/:id/reject
 * Reject civic action (admin only)
 */
router.post('/:id/reject', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const action = await prisma.civicAction.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectionReason: reason,
      },
    });

    res.json({
      id: action.id,
      title: action.title,
      status: action.status,
    });
  } catch (error) {
    handleError(res, error, 'Failed to reject civic action', 'civic-actions/reject');
  }
});

/**
 * POST /api/civic-actions/:id/toggle-pin
 * Toggle pin status (admin only)
 */
router.post('/:id/toggle-pin', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const action = await prisma.civicAction.findUnique({
      where: { id },
    });

    if (!action) {
      throw ApiError.notFound('Civic action');
    }

    const updated = await prisma.civicAction.update({
      where: { id },
      data: { isPinned: !action.isPinned },
    });

    res.json({
      id: updated.id,
      title: updated.title,
      isPinned: updated.isPinned,
    });
  } catch (error) {
    handleError(res, error, 'Failed to toggle pin status', 'civic-actions/toggle-pin');
  }
});

/**
 * POST /api/civic-actions/:id/set-priority
 * Set priority (admin only)
 */
router.post('/:id/set-priority', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (typeof priority !== 'number' || priority < 0 || priority > 100) {
      throw ApiError.validation('Priority must be a number between 0 and 100');
    }

    const action = await prisma.civicAction.update({
      where: { id },
      data: { priority },
    });

    res.json(action);
  } catch (error) {
    handleError(res, error, 'Failed to set priority', 'civic-actions/set-priority');
  }
});

/**
 * POST /api/civic-actions/:id/recommend
 * Mark as recommended by admin
 */
router.post('/:id/recommend', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;

    const action = await prisma.civicAction.update({
      where: { id },
      data: {
        recommendedBy: authReq.user.id,
      },
      include: {
        recommender: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    res.json(action);
  } catch (error) {
    handleError(res, error, 'Failed to recommend civic action', 'civic-actions/recommend');
  }
});

export default router;
