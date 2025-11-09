import express from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

export const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
export const prisma = new PrismaClient();

/**
 * Create a test Express app with authentication middleware
 */
export function createTestApp() {
  const app = express();
  app.use(express.json());

  // Auth middleware
  function authenticateToken(req: any, res: any, next: any) {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      req.userId = decoded.userId;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  // User Engagement Routes
  app.get('/api/user/impact', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).userId;

      const engagements = await prisma.userEngagement.findMany({
        where: { userId },
        include: {
          civicAction: {
            include: {
              user: {
                select: { id: true, name: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const activeCommitments = engagements.filter(e =>
        e.status === 'interested' || e.status === 'going'
      );
      const completedActions = engagements.filter(e =>
        e.status === 'completed'
      );

      const createdActions = await prisma.civicAction.findMany({
        where: {
          userId,
          source: 'user_submitted'
        },
        include: {
          engagements: true,
          reviewer: {
            select: { id: true, name: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const createdArticles = await prisma.post.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      const metrics = {
        completedActionsCount: completedActions.length,
        activeCommitmentsCount: activeCommitments.length,
        createdActionsCount: createdActions.length,
        createdArticlesCount: createdArticles.length,
      };

      res.json({
        metrics,
        activeCommitments: activeCommitments.map(e => ({
          id: e.id,
          status: e.status,
          notes: e.notes,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          civicAction: e.civicAction
        })),
        completedActions: completedActions.map(e => ({
          id: e.id,
          status: e.status,
          notes: e.notes,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          civicAction: e.civicAction
        })),
        createdActions: createdActions.map(action => ({
          ...action,
          engagementCount: action.engagements.length
        })),
        createdArticles
      });
    } catch (error) {
      console.error('Get user impact error:', error);
      res.status(500).json({ error: 'Failed to fetch user impact data' });
    }
  });

  app.post('/api/user/engagements', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { civicActionId, status, notes } = req.body;

      if (!civicActionId) {
        return res.status(400).json({ error: 'civicActionId is required' });
      }

      const validStatuses = ['interested', 'going', 'completed'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be one of: interested, going, completed' });
      }

      const existing = await prisma.userEngagement.findUnique({
        where: {
          userId_civicActionId: {
            userId,
            civicActionId
          }
        }
      });

      if (existing) {
        return res.status(400).json({ error: 'Engagement already exists. Use PATCH to update.' });
      }

      const engagement = await prisma.userEngagement.create({
        data: {
          userId,
          civicActionId,
          status: status || 'interested',
          notes: notes || null
        },
        include: {
          civicAction: {
            include: {
              user: {
                select: { id: true, name: true }
              }
            }
          }
        }
      });

      res.json(engagement);
    } catch (error) {
      console.error('Create engagement error:', error);
      res.status(500).json({ error: 'Failed to create engagement' });
    }
  });

  app.patch('/api/user/engagements/:id', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;
      const { status, notes } = req.body;

      const existing = await prisma.userEngagement.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Engagement not found' });
      }

      if (existing.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (status) {
        const validStatuses = ['interested', 'going', 'completed'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: 'Invalid status. Must be one of: interested, going, completed' });
        }
      }

      const engagement = await prisma.userEngagement.update({
        where: { id },
        data: {
          status: status ?? undefined,
          notes: notes !== undefined ? notes : undefined
        },
        include: {
          civicAction: {
            include: {
              user: {
                select: { id: true, name: true }
              }
            }
          }
        }
      });

      res.json(engagement);
    } catch (error) {
      console.error('Update engagement error:', error);
      res.status(500).json({ error: 'Failed to update engagement' });
    }
  });

  app.delete('/api/user/engagements/:id', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;

      const existing = await prisma.userEngagement.findUnique({
        where: { id }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Engagement not found' });
      }

      if (existing.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await prisma.userEngagement.delete({
        where: { id }
      });

      res.json({ message: 'Engagement deleted successfully' });
    } catch (error) {
      console.error('Delete engagement error:', error);
      res.status(500).json({ error: 'Failed to delete engagement' });
    }
  });

  return app;
}

/**
 * Create an auth token for testing
 */
export function createAuthToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Cleanup test data
 */
export async function cleanupTestData() {
  await prisma.userEngagement.deleteMany({});
  await prisma.civicAction.deleteMany({
    where: { source: { in: ['mobilize', 'user_submitted'] } }
  });
  await prisma.post.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { contains: 'test-' } }
  });
}
