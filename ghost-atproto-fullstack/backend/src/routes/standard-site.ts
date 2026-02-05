import express from 'express';
import { PrismaClient } from '@prisma/client';
import { AtpAgent } from '@atproto/api';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { fetchGhostSiteMetadata } from '../lib/ghost-admin';
import { getOrCreatePublication, PublicationMetadata } from '../lib/standard-site';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/standard-site/publication-preview
 * Fetch publication metadata from Ghost (for preview before enabling)
 */
router.get('/publication-preview', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ghostUrl: true,
        ghostApiKey: true,
        publicationName: true,
        publicationDescription: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.ghostUrl || !user.ghostApiKey) {
      return res.status(400).json({
        error: 'Ghost URL and API key are required. Please configure them in Settings first.',
      });
    }

    // Fetch metadata from Ghost
    const metadata = await fetchGhostSiteMetadata(user.ghostUrl, user.ghostApiKey);

    // Allow user to override stored values
    const preview = {
      url: metadata.url,
      name: user.publicationName || metadata.title,
      description: user.publicationDescription || metadata.description,
      icon: metadata.icon,
      logo: metadata.logo,
      fromGhost: {
        title: metadata.title,
        description: metadata.description,
      },
    };

    res.json(preview);
  } catch (error) {
    console.error('Publication preview error:', error);
    res.status(500).json({
      error: 'Failed to fetch publication preview',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/standard-site/enable
 * Enable standard.site for the user and create publication record
 */
router.post('/enable', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { publicationName, publicationDescription, dualPost } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ghostUrl: true,
        ghostApiKey: true,
        blueskyHandle: true,
        blueskyPassword: true,
        useStandardSite: true,
        standardSitePublicationUri: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.useStandardSite && user.standardSitePublicationUri) {
      return res.status(400).json({
        error: 'Standard.site is already enabled for this user',
        publicationUri: user.standardSitePublicationUri,
      });
    }

    if (!user.ghostUrl || !user.ghostApiKey) {
      return res.status(400).json({
        error: 'Ghost URL and API key are required',
      });
    }

    if (!user.blueskyHandle || !user.blueskyPassword) {
      return res.status(400).json({
        error: 'Bluesky credentials are required',
      });
    }

    // Create authenticated agent
    const agent = new AtpAgent({
      service: process.env.BLUESKY_SERVICE_URL || 'https://bsky.social',
    });

    await agent.login({
      identifier: user.blueskyHandle,
      password: user.blueskyPassword,
    });

    // Prepare publication metadata
    const metadata: PublicationMetadata = {
      url: user.ghostUrl,
      name: publicationName || 'My Blog',
      description: publicationDescription || undefined,
    };

    // Create publication record
    console.log('Creating standard.site publication...');
    const publication = await getOrCreatePublication(agent, userId, metadata);

    // Enable standard.site for user
    await prisma.user.update({
      where: { id: userId },
      data: {
        useStandardSite: true,
        standardSiteDualPost: dualPost || false,
        publicationName: metadata.name,
        publicationDescription: metadata.description,
        standardSitePublicationUri: publication.uri,
        standardSitePublicationRkey: publication.rkey,
      },
    });

    console.log('Standard.site enabled for user:', userId);

    res.json({
      success: true,
      message: 'Standard.site enabled successfully',
      publication: {
        uri: publication.uri,
        rkey: publication.rkey,
        name: metadata.name,
        url: metadata.url,
      },
      settings: {
        useStandardSite: true,
        dualPost: dualPost || false,
      },
    });
  } catch (error) {
    console.error('Enable standard.site error:', error);
    res.status(500).json({
      error: 'Failed to enable standard.site',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/standard-site/disable
 * Disable standard.site for the user (keeps publication record)
 */
router.post('/disable', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;

    await prisma.user.update({
      where: { id: userId },
      data: {
        useStandardSite: false,
      },
    });

    res.json({
      success: true,
      message: 'Standard.site disabled. Publication record preserved.',
    });
  } catch (error) {
    console.error('Disable standard.site error:', error);
    res.status(500).json({
      error: 'Failed to disable standard.site',
    });
  }
});

/**
 * PATCH /api/standard-site/settings
 * Update standard.site settings (dual post, publication metadata)
 */
router.patch('/settings', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { dualPost, publicationName, publicationDescription } = req.body;

    const updates: any = {};

    if (dualPost !== undefined) {
      updates.standardSiteDualPost = dualPost;
    }

    if (publicationName !== undefined) {
      updates.publicationName = publicationName;
    }

    if (publicationDescription !== undefined) {
      updates.publicationDescription = publicationDescription;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updates,
      select: {
        useStandardSite: true,
        standardSiteDualPost: true,
        publicationName: true,
        publicationDescription: true,
        standardSitePublicationUri: true,
      },
    });

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: user,
    });
  } catch (error) {
    console.error('Update standard.site settings error:', error);
    res.status(500).json({
      error: 'Failed to update settings',
    });
  }
});

/**
 * GET /api/standard-site/status
 * Get current standard.site status for the user
 */
router.get('/status', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        useStandardSite: true,
        standardSiteDualPost: true,
        standardSitePublicationUri: true,
        standardSitePublicationRkey: true,
        publicationName: true,
        publicationDescription: true,
        ghostUrl: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      enabled: user.useStandardSite,
      dualPost: user.standardSiteDualPost,
      publication: user.standardSitePublicationUri
        ? {
            uri: user.standardSitePublicationUri,
            rkey: user.standardSitePublicationRkey,
            name: user.publicationName,
            description: user.publicationDescription,
            url: user.ghostUrl,
          }
        : null,
    });
  } catch (error) {
    console.error('Get standard.site status error:', error);
    res.status(500).json({
      error: 'Failed to get status',
    });
  }
});

export default router;
