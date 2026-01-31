import express from 'express';
import { PrismaClient } from '@prisma/client';
import { AtpAgent } from '@atproto/api';
import { publishToBluesky } from '../lib/atproto';
import bcrypt from 'bcryptjs';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  getOrCreatePublication,
  createDocument,
  PublicationMetadata,
} from '../lib/standard-site';
import { fetchGhostSiteMetadata } from '../lib/ghost-admin';

const router = express.Router();
const prisma = new PrismaClient();

// Publish post to ATProto/Bluesky (requires authentication)
router.post('/publish', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { postId, customText } = req.body;

    if (!postId) {
      return res.status(400).json({
        error: 'Post ID is required'
      });
    }

    // Get the authenticated user with their Bluesky credentials
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.blueskyHandle || !user.blueskyPassword) {
      return res.status(400).json({
        error: 'Bluesky credentials not configured. Please add your Bluesky handle and app password in Settings.'
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

    // Verify the post belongs to this user
    if (post.userId !== userId) {
      return res.status(403).json({
        error: 'You can only publish your own posts'
      });
    }

    if (post.status !== 'published') {
      return res.status(400).json({
        error: 'Only published posts can be synced to ATProto'
      });
    }

    // Check if already posted
    if (post.atprotoUri) {
      return res.status(400).json({
        error: 'Post has already been published to Bluesky',
        atprotoUri: post.atprotoUri
      });
    }

    // Check if user has standard.site enabled
    if (user.useStandardSite) {
      // ===== STANDARD.SITE PUBLISHING =====
      console.log('Publishing using standard.site format...');

      // Create authenticated agent
      const agent = new AtpAgent({
        service: process.env.BLUESKY_SERVICE_URL || 'https://bsky.social'
      });

      await agent.login({
        identifier: user.blueskyHandle,
        password: user.blueskyPassword
      });

      // Get or create publication
      let publicationMetadata: PublicationMetadata;

      if (user.publicationName && user.ghostUrl) {
        // Use stored publication metadata
        publicationMetadata = {
          url: user.ghostUrl,
          name: user.publicationName,
          description: user.publicationDescription || undefined,
        };
      } else if (user.ghostUrl && user.ghostApiKey) {
        // Fetch metadata from Ghost API
        console.log('Fetching publication metadata from Ghost...');
        const ghostMetadata = await fetchGhostSiteMetadata(user.ghostUrl, user.ghostApiKey);
        publicationMetadata = {
          url: ghostMetadata.url,
          name: ghostMetadata.title,
          description: ghostMetadata.description,
          icon: ghostMetadata.icon,
        };

        // Store metadata for future use
        await prisma.user.update({
          where: { id: userId },
          data: {
            publicationName: ghostMetadata.title,
            publicationDescription: ghostMetadata.description,
          },
        });
      } else {
        return res.status(400).json({
          error: 'Ghost URL and API key are required for standard.site publishing'
        });
      }

      // Get or create publication record
      const publication = await getOrCreatePublication(agent, userId, publicationMetadata);
      console.log('Publication ready:', publication.uri);

      // Create document record for this post
      const documentResult = await createDocument(agent, publication.uri, {
        title: post.title,
        content: post.content,
        slug: post.slug,
        publishedAt: post.publishedAt || new Date(),
        excerpt: post.excerpt || undefined,
      });

      console.log('Document created:', documentResult.uri);

      // If dual post is enabled, also create social post
      let socialPostUri = null;
      let socialPostCid = null;

      if (user.standardSiteDualPost && customText) {
        console.log('Dual posting: creating social post...');
        try {
          if (customText.trim().length > 0 && customText.length <= 300) {
            const socialResult = await publishToBluesky(customText, {
              handle: user.blueskyHandle,
              password: user.blueskyPassword
            });
            socialPostUri = socialResult.uri;
            socialPostCid = socialResult.cid;
            console.log('Social post created:', socialPostUri);
          }
        } catch (socialError) {
          console.error('Social post failed, continuing with document:', socialError);
          // Don't fail the whole operation if social post fails
        }
      }

      // Update sync logs
      await prisma.syncLog.create({
        data: {
          action: 'publish_to_standard_site',
          status: 'success',
          source: 'ghost',
          target: 'atproto',
          postId: post.id,
          ghostId: post.ghostId,
          atprotoUri: documentResult.uri,
          userId: post.userId
        }
      });

      // Update the post with standard.site document URI
      await prisma.post.update({
        where: { id: postId },
        data: {
          standardSiteDocumentUri: documentResult.uri,
          atprotoUri: socialPostUri, // Legacy field, stores social post if dual post
          atprotoCid: socialPostCid,
          updatedAt: new Date()
        }
      });

      res.json({
        success: true,
        message: 'Post published to standard.site successfully',
        postId: post.id,
        title: post.title,
        format: 'standard.site',
        standardSiteDocumentUri: documentResult.uri,
        standardSitePublicationUri: publication.uri,
        socialPostUri: socialPostUri || undefined,
        dualPost: user.standardSiteDualPost,
      });
    } else {
      // ===== LEGACY PUBLISHING (social post) =====
      console.log('Publishing using legacy format (social post)...');

      // Use the customText directly - user has full control
      const blueskyContent = customText;

      if (!blueskyContent || blueskyContent.trim().length === 0) {
        return res.status(400).json({
          error: 'Post content is required'
        });
      }

      // Bluesky character limit is 300
      if (blueskyContent.length > 300) {
        return res.status(400).json({
          error: `Content exceeds Bluesky's 300 character limit (currently ${blueskyContent.length} characters)`
        });
      }

      // Publish using ATProto with user's credentials
      const atprotoResult = await publishToBluesky(blueskyContent, {
        handle: user.blueskyHandle,
        password: user.blueskyPassword
      });

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
        format: 'legacy',
        atprotoUri: atprotoResult.uri,
        atprotoCid: atprotoResult.cid
      });
    }

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
            // Create fallback user with hashed password
            const hashedPassword = await bcrypt.hash(`fallback-${Date.now()}`, 10);
            const newUser = await prisma.user.create({
              data: { 
                email: `error-log-user-${Date.now()}@local`,
                password: hashedPassword
              }
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