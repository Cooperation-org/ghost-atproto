import express from 'express';
import { PrismaClient } from '@prisma/client';
import { BskyAgent } from '@atproto/api';
import jwt from 'jsonwebtoken';
import axios from 'axios';

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
 * Validate Ghost site connection
 * POST /api/wizard/validate-ghost
 */
router.post('/validate-ghost', authenticateToken, async (req, res) => {
  try {
    const { ghostUrl, ghostApiKey } = req.body;

    if (!ghostUrl || !ghostApiKey) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Ghost URL and API Key are required' 
      });
    }

    // Validate URL format
    let url: URL;
    try {
      url = new URL(ghostUrl);
    } catch {
      return res.status(400).json({ 
        valid: false, 
        error: 'Invalid Ghost URL format' 
      });
    }

    // Extract key ID and secret from the API key
    const [id, secret] = ghostApiKey.split(':');
    if (!id || !secret) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Invalid API key format. Expected format: id:secret' 
      });
    }

    // Create JWT token for Ghost Admin API
    const token = jwt.sign({}, Buffer.from(secret, 'hex'), {
      keyid: id,
      algorithm: 'HS256',
      expiresIn: '5m',
      audience: `/admin/`
    });

    // Test connection to Ghost API (using global fetch available in Node.js 18+)
    const ghostApiUrl = `${url.origin}/ghost/api/admin/site/`;
    const response = await global.fetch(ghostApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Ghost ${token}`,
        'Accept-Version': 'v5.0'
      }
    });

    if (!response.ok) {
      return res.json({ 
        valid: false, 
        error: `Ghost API error: ${response.statusText}` 
      });
    }

    const siteData: any = await response.json();

    return res.json({
      valid: true,
      site: {
        title: siteData?.site?.title || 'Unknown',
        description: siteData?.site?.description || '',
        url: siteData?.site?.url || ghostUrl
      }
    });

  } catch (error) {
    console.error('Ghost validation error:', error);
    return res.status(500).json({ 
      valid: false, 
      error: error instanceof Error ? error.message : 'Failed to validate Ghost connection' 
    });
  }
});

/**
 * Validate Bluesky credentials
 * POST /api/wizard/validate-bluesky
 */
router.post('/validate-bluesky', authenticateToken, async (req, res) => {
  try {
    const { blueskyHandle, blueskyPassword } = req.body;

    if (!blueskyHandle || !blueskyPassword) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Bluesky handle and password are required' 
      });
    }

    // Test Bluesky login
    const agent = new BskyAgent({ 
      service: process.env.ATPROTO_SERVICE || 'https://bsky.social' 
    });

    try {
      const loginResult = await agent.login({
        identifier: blueskyHandle,
        password: blueskyPassword,
      });

      // Fetch profile to get display name
      let displayName = blueskyHandle;
      try {
        const profile = await agent.getProfile({ actor: loginResult.data.did });
        displayName = profile.data.displayName || blueskyHandle;
      } catch (profileErr) {
        // If profile fetch fails, use handle as display name
        console.warn('Failed to fetch profile:', profileErr);
      }

      return res.json({
        valid: true,
        profile: {
          handle: loginResult.data.handle,
          did: loginResult.data.did,
          displayName
        }
      });

    } catch (loginError: any) {
      return res.json({ 
        valid: false, 
        error: loginError.message || 'Invalid Bluesky credentials' 
      });
    }

  } catch (error) {
    console.error('Bluesky validation error:', error);
    return res.status(500).json({ 
      valid: false, 
      error: error instanceof Error ? error.message : 'Failed to validate Bluesky connection' 
    });
  }
});

/**
 * Complete wizard setup - save all configuration
 * POST /api/wizard/complete
 */
router.post('/complete', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { 
      ghostUrl, 
      ghostApiKey,
      ghostContentApiKey,
      blueskyHandle, 
      blueskyPassword,
      name,
      autoSync = true
    } = req.body;

    // Validate required fields - Ghost is always required, Bluesky can be skipped
    if (!ghostUrl || !ghostApiKey) {
      return res.status(400).json({ 
        error: 'Ghost URL and Admin API key are required' 
      });
    }

    // Check if Bluesky is being skipped
    const isBlueskySkipped = blueskyHandle === 'SKIPPED' || blueskyPassword === 'SKIPPED';
    
    // If not skipped, validate Bluesky fields
    if (!isBlueskySkipped && (!blueskyHandle || !blueskyPassword)) {
      return res.status(400).json({ 
        error: 'Bluesky handle and password are required, or mark as SKIPPED' 
      });
    }

    // Update user with all settings
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name || undefined,
        ghostUrl,
        ghostApiKey,
        ghostContentApiKey: ghostContentApiKey || undefined,
        blueskyHandle,
        blueskyPassword,
        autoSync,
      },
      select: {
        id: true,
        email: true,
        name: true,
        ghostUrl: true,
        ghostApiKey: true,
        ghostContentApiKey: true,
        blueskyHandle: true,
        blueskyPassword: true, createdAt: true
      }
    });

    // Generate webhook URL for Ghost
    const webhookUrl = `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/ghost/webhook`;

    // Trigger initial sync in the background only if Bluesky is configured
    const syncResults = {
      attempted: false,
      success: false,
      syncedCount: 0,
      error: null as string | null
    };

    if (!isBlueskySkipped) {
      try {
        // We'll trigger sync by making a request to our own sync endpoint
        // This is a fire-and-forget operation
        
        // Get a fresh JWT token for the sync request
        const token = jwt.sign(
          { userId },
          JWT_SECRET,
          { expiresIn: '1h' }
        );

        // Trigger sync without waiting for it to complete
        axios.post(
          `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/auth/sync`,
          { limit: 50, force: false },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        ).then((syncResponse: any) => {
          console.log('✅ Initial sync completed:', syncResponse.data);
          syncResults.attempted = true;
          syncResults.success = true;
          syncResults.syncedCount = syncResponse.data.syncedCount || 0;
        }).catch((syncError: any) => {
          console.error('⚠️ Initial sync failed:', syncError.message);
          syncResults.attempted = true;
          syncResults.error = syncError.message;
        });

      } catch (error) {
        console.error('Failed to trigger initial sync:', error);
      }
    }

    return res.json({
      success: true,
      user: updatedUser,
      webhookUrl,
      message: isBlueskySkipped 
        ? 'Setup complete! Ghost configuration saved. You can configure Bluesky later from your dashboard.'
        : 'Setup complete! Initial sync has been triggered in the background.',
      syncTriggered: !isBlueskySkipped,
      nextSteps: {
        webhookInstructions: [
          '1. Go to your Ghost Admin panel',
          '2. Navigate to Settings → Integrations → Custom Integrations',
          '3. Create a new custom integration named "CivicSky Bridge"',
          '4. Add a webhook with the following URL:',
          `   ${webhookUrl}`,
          '5. Select "Post published" as the event',
          `6. Add a custom header: X-User-ID = ${userId}`,
          '7. Save the webhook',
          isBlueskySkipped 
            ? '8. ⚠️ Bluesky not configured - configure it later to enable auto-sync'
            : autoSync 
              ? '8. ✅ Auto-sync is ENABLED - new posts will automatically sync to Bluesky' 
              : '8. ⚠️ Auto-sync is DISABLED - you can manually sync posts from your dashboard'
        ]
      }
    });

  } catch (error) {
    console.error('Wizard completion error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to complete setup' 
    });
  }
});

/**
 * Skip wizard setup for authors who don't want to configure Ghost/Bluesky
 * POST /api/wizard/skip
 */
router.post('/skip', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    
    // Get user to check their role
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only allow authors to skip
    if (user.role !== 'AUTHOR') {
      return res.status(403).json({ 
        error: 'Only authors can skip the wizard setup' 
      });
    }

    // Update user to mark Bluesky as skipped (only skip Bluesky, not Ghost)
    await prisma.user.update({
      where: { id: userId },
      data: {
        // Only mark Bluesky as skipped, leave Ghost fields as they are
        blueskyHandle: 'SKIPPED',
        blueskyPassword: 'SKIPPED',
      }
    });

    return res.json({
      success: true,
      message: 'Bluesky setup skipped successfully. You can configure Bluesky later from your dashboard.',
      skipped: true
    });

  } catch (error) {
    console.error('Wizard skip error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to skip wizard setup' 
    });
  }
});

/**
 * Get wizard status - check if user has completed setup
 * GET /api/wizard/status
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ghostUrl: true,
        ghostApiKey: true,
        ghostContentApiKey: true,
        blueskyHandle: true,
        blueskyPassword: true,
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isBlueskySkipped = user.blueskyHandle === 'SKIPPED';
    const isGhostSkipped = user.ghostUrl === 'SKIPPED';
    const isComplete = !!(
      user.ghostUrl && 
      user.ghostApiKey && 
      user.blueskyHandle && 
      user.blueskyPassword &&
      !isBlueskySkipped &&
      !isGhostSkipped
    );

    return res.json({
      isComplete,
      isSkipped: isBlueskySkipped || isGhostSkipped,
      hasGhost: !!(user.ghostUrl && user.ghostApiKey && !isGhostSkipped),
      hasBluesky: !!(user.blueskyHandle && user.blueskyPassword && !isBlueskySkipped),
      isBlueskySkipped,
      isGhostSkipped,
    });

  } catch (error) {
    console.error('Wizard status error:', error);
    return res.status(500).json({ 
      error: 'Failed to check wizard status' 
    });
  }
});

export default router;

