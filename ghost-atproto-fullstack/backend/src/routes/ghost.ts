import express from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { ensureBlueskyMember } from '../lib/ghost-admin';
import { syncCommentsForPost, syncAllComments } from '../services/comment-sync';
import { createShimClient, ShimClient } from '../lib/shim-client';

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

/**
 * Check if shim is configured and healthy
 * GET /api/ghost/shim/status
 */
router.get('/shim/status', authenticateToken, async (req, res) => {
  try {
    const shimUrl = process.env.SHIM_URL;
    const shimSecret = process.env.SHIM_SHARED_SECRET;

    if (!shimUrl || !shimSecret) {
      return res.json({
        configured: false,
        healthy: false,
        message: 'SHIM_URL and SHIM_SHARED_SECRET not configured',
      });
    }

    const shimClient = createShimClient();
    const healthy = await shimClient.healthCheck();

    return res.json({
      configured: true,
      healthy,
      shimUrl,
    });
  } catch (error) {
    console.error('Shim status error:', error);
    return res.status(500).json({
      error: 'Failed to check shim status',
    });
  }
});

/**
 * Sync comments for a specific post from Bluesky to Ghost
 * POST /api/ghost/sync-comments/:postId
 */
router.post('/sync-comments/:postId', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { postId } = req.params;

    // Verify user owns this post
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { userId: true, title: true, atprotoUri: true, ghostId: true },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!post.atprotoUri) {
      return res.status(400).json({ error: 'Post has not been published to Bluesky' });
    }

    if (!post.ghostId) {
      return res.status(400).json({ error: 'Post has no Ghost ID' });
    }

    // Check shim configuration
    if (!process.env.SHIM_URL || !process.env.SHIM_SHARED_SECRET) {
      return res.status(400).json({
        error: 'Comment sync not configured. Set SHIM_URL and SHIM_SHARED_SECRET.',
      });
    }

    const shimClient = createShimClient();

    // Verify shim is healthy
    const shimHealthy = await shimClient.healthCheck();
    if (!shimHealthy) {
      return res.status(503).json({ error: 'Comment shim is not available' });
    }

    // Sync comments
    const result = await syncCommentsForPost(postId, shimClient);

    return res.json({
      success: true,
      postId,
      postTitle: post.title,
      newComments: result.newComments,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Sync comments error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to sync comments',
    });
  }
});

/**
 * Sync comments for all eligible posts
 * POST /api/ghost/sync-comments
 */
router.post('/sync-comments', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required for bulk sync' });
    }

    // Check shim configuration
    if (!process.env.SHIM_URL || !process.env.SHIM_SHARED_SECRET) {
      return res.status(400).json({
        error: 'Comment sync not configured. Set SHIM_URL and SHIM_SHARED_SECRET.',
      });
    }

    const shimClient = createShimClient();

    // Verify shim is healthy
    const shimHealthy = await shimClient.healthCheck();
    if (!shimHealthy) {
      return res.status(503).json({ error: 'Comment shim is not available' });
    }

    // Sync all comments
    const results = await syncAllComments(shimClient);

    const totalNew = results.reduce((sum, r) => sum + r.newComments, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    return res.json({
      success: true,
      postsProcessed: results.length,
      totalNewComments: totalNew,
      totalErrors,
      results,
    });
  } catch (error) {
    console.error('Sync all comments error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to sync comments',
    });
  }
});

export default router;
