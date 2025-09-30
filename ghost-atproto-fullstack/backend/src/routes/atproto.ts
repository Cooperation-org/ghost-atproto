import express from 'express';
import { PrismaClient } from '@prisma/client';
import { publishToBluesky } from '../lib/atproto';

const router = express.Router();
const prisma = new PrismaClient();

// Publish post to ATProto/Bluesky
router.post('/publish', async (req, res) => {
  try {
    const { postId } = req.body;

    if (!postId) {
      return res.status(400).json({ 
        error: 'Post ID is required' 
      });
    }

    // Get post from database
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { user: true }
    });

    if (!post) {
      return res.status(404).json({ 
        error: 'Post not found' 
      });
    }

    if (post.status !== 'published') {
      return res.status(400).json({ 
        error: 'Only published posts can be synced to ATProto' 
      });
    }

    // Format content for Bluesky
    let blueskyContent = post.title;
    
    // Add content preview if available
    if (post.content) {
      const textContent = post.content.replace(/<[^>]*>/g, ''); // Strip HTML
      const preview = textContent.substring(0, 200);
      if (preview.length < textContent.length) {
        blueskyContent += `\n\n${preview}...`;
      } else {
        blueskyContent += `\n\n${preview}`;
      }
    }

    // Add link to original post if available
    if (post.ghostUrl) {
      blueskyContent += `\n\nRead more: ${post.ghostUrl}`;
    }

    // Ensure content doesn't exceed Bluesky's character limit (300 chars)
    if (blueskyContent.length > 280) {
      blueskyContent = blueskyContent.substring(0, 277) + '...';
    }

    // Publish using ATProto
    const atprotoResult = await publishToBluesky(blueskyContent);

    // Update sync_logs
    await prisma.syncLog.create({
      data: {
        action: 'publish_to_atproto',
        status: 'success',
        source: 'ghost',
        target: 'atproto',
        postId: post.id,
        ghostId: post.ghostId,
        atprotoUri: atprotoResult.uri,
        userId: post.userId
      }
    });

    // Update the post to track ATProto URI and CID
    await prisma.post.update({
      where: { id: postId },
      data: {
        atprotoUri: atprotoResult.uri,
        atprotoCid: atprotoResult.cid,
        updatedAt: new Date()
      }
    });

    res.json({ 
      success: true, 
      message: 'Post published to ATProto successfully',
      postId: post.id,
      title: post.title,
      atprotoUri: atprotoResult.uri,
      atprotoCid: atprotoResult.cid
    });

  } catch (error) {
    console.error('ATProto publish error:', error);

    // Log the error
    try {
      const { postId } = req.body;
      if (postId) {
        const post = await prisma.post.findUnique({
          where: { id: postId }
        });
        
        // Get a fallback user for error logging
        let userId = post?.userId;
        if (!userId) {
          const fallbackUser = await prisma.user.findFirst();
          userId = fallbackUser?.id;
          if (!userId) {
            const newUser = await prisma.user.create({
              data: { email: `error-log-user-${Date.now()}@local` }
            });
            userId = newUser.id;
          }
        }

        await prisma.syncLog.create({
          data: {
            action: 'publish_to_atproto',
            status: 'error',
            source: 'ghost',
            target: 'atproto',
            postId: post?.id,
            ghostId: post?.ghostId,
            userId: userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    } catch (logError) {
      console.error('Failed to log sync error:', logError);
    }

    res.status(500).json({ 
      error: 'Failed to publish to ATProto',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get sync logs for a specific post
router.get('/sync-logs/:postId', async (req, res) => {
  try {
    const { postId } = req.params;

    const logs = await prisma.syncLog.findMany({
      where: { postId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(logs);
  } catch (error) {
    console.error('Error fetching sync logs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch sync logs' 
    });
  }
});

// Get all sync logs
router.get('/sync-logs', async (req, res) => {
  try {
    const logs = await prisma.syncLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100 // Limit to last 100 logs
    });

    res.json(logs);
  } catch (error) {
    console.error('Error fetching sync logs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch sync logs' 
    });
  }
});

// Test endpoint to check ATProto functionality without database
router.post('/test-publish', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ 
        error: 'Content is required for testing' 
      });
    }

    // Test ATProto publishing directly
    const atprotoResult = await publishToBluesky(content);

    res.json({ 
      success: true, 
      message: 'Test post published to ATProto successfully',
      content: content,
      atprotoUri: atprotoResult.uri,
      atprotoCid: atprotoResult.cid
    });

  } catch (error) {
    console.error('ATProto test publish error:', error);
    res.status(500).json({ 
      error: 'Failed to publish test post to ATProto',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;