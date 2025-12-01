import express from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { ensureBlueskyMember } from '../lib/ghost-admin';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to authenticate token
function authenticateToken(req: any, res: any, next: any) {
  const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');

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

/**
 * Create or get the Bluesky member for comment sync
 * POST /api/ghost/bluesky-member/setup
 */
router.post('/bluesky-member/setup', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;

    // Get user's Ghost credentials
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ghostUrl: true,
        ghostApiKey: true,
        blueskyMemberId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.ghostUrl || !user.ghostApiKey) {
      return res.status(400).json({
        error: 'Ghost URL and API key must be configured first'
      });
    }

    // Create or get the Bluesky member
    const member = await ensureBlueskyMember(user.ghostUrl, user.ghostApiKey);

    // Save the member ID to the user
    await prisma.user.update({
      where: { id: userId },
      data: { blueskyMemberId: member.id },
    });

    return res.json({
      success: true,
      member: {
        id: member.id,
        name: member.name,
        email: member.email,
      },
      message: 'Bluesky member created successfully',
    });
  } catch (error) {
    console.error('Bluesky member setup error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to set up Bluesky member'
    });
  }
});

/**
 * Get the Bluesky member status
 * GET /api/ghost/bluesky-member/status
 */
router.get('/bluesky-member/status', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        blueskyMemberId: true,
        ghostUrl: true,
        ghostApiKey: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isConfigured = !!(user.ghostUrl && user.ghostApiKey);
    const isSetup = !!user.blueskyMemberId;

    return res.json({
      isConfigured,
      isSetup,
      memberId: user.blueskyMemberId,
    });
  } catch (error) {
    console.error('Bluesky member status error:', error);
    return res.status(500).json({
      error: 'Failed to check Bluesky member status'
    });
  }
});

export default router;
