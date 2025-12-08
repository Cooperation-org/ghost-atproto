import express from 'express';
import { PrismaClient } from '@prisma/client';
import { ensureBlueskyMember } from '../lib/ghost-admin';
import { syncCommentsForPost } from '../services/comment-sync';
import { ShimClient } from '../lib/shim-client';
import { runCommentSync } from '../jobs/sync-comments';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

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
 * Configure shim URL and secret for comment sync
 * POST /api/ghost/shim/config
 */
router.post('/shim/config', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { shimUrl, shimSecret } = req.body;

    if (!shimUrl || !shimSecret) {
      return res.status(400).json({ error: 'shimUrl and shimSecret are required' });
    }

    if (shimSecret.length < 32) {
      return res.status(400).json({ error: 'shimSecret must be at least 32 characters' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { shimUrl, shimSecret },
    });

    return res.json({ success: true, message: 'Shim configuration saved' });
  } catch (error) {
    console.error('Shim config error:', error);
    return res.status(500).json({ error: 'Failed to save shim configuration' });
  }
});

/**
 * Check if shim is configured and healthy
 * GET /api/ghost/shim/status
 */
router.get('/shim/status', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { shimUrl: true, shimSecret: true },
    });

    if (!user?.shimUrl || !user?.shimSecret) {
      return res.json({
        configured: false,
        healthy: false,
        message: 'Shim URL and secret not configured',
      });
    }

    const shimClient = new ShimClient({
      shimUrl: user.shimUrl,
      sharedSecret: user.shimSecret,
    });
    const healthy = await shimClient.healthCheck();

    return res.json({
      configured: true,
      healthy,
      shimUrl: user.shimUrl,
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

    // Get user's shim config
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { shimUrl: true, shimSecret: true },
    });

    if (!user?.shimUrl || !user?.shimSecret) {
      return res.status(400).json({
        error: 'Shim not configured. Go to Settings to configure your comment sync.',
      });
    }

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

    const shimClient = new ShimClient({
      shimUrl: user.shimUrl,
      sharedSecret: user.shimSecret,
    });

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
 * Sync comments for all users (admin only)
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

    // Run the sync job for all users
    const result = await runCommentSync();

    return res.json({
      success: result.success,
      usersProcessed: result.usersProcessed,
      postsProcessed: result.postsProcessed,
      totalNewComments: result.totalNewComments,
      totalErrors: result.totalErrors,
    });
  } catch (error) {
    console.error('Sync all comments error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to sync comments',
    });
  }
});

export default router;
