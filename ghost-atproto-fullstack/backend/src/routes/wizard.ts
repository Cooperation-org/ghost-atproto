import express from 'express';
import { PrismaClient } from '@prisma/client';
import { BskyAgent } from '@atproto/api';
import jwt from 'jsonwebtoken';

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
    const { atprotoHandle, atprotoAppPassword } = req.body;

    if (!atprotoHandle || !atprotoAppPassword) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Bluesky handle and app password are required' 
      });
    }

    // Test Bluesky login
    const agent = new BskyAgent({ 
      service: process.env.ATPROTO_SERVICE || 'https://bsky.social' 
    });

    try {
      const loginResult = await agent.login({
        identifier: atprotoHandle,
        password: atprotoAppPassword,
      });

      // Fetch profile to get display name
      let displayName = atprotoHandle;
      try {
        const profile = await agent.getProfile({ actor: loginResult.data.did });
        displayName = profile.data.displayName || atprotoHandle;
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
      atprotoHandle, 
      atprotoAppPassword,
      name 
    } = req.body;

    // Validate all required fields
    if (!ghostUrl || !ghostApiKey || !atprotoHandle || !atprotoAppPassword) {
      return res.status(400).json({ 
        error: 'All configuration fields are required' 
      });
    }

    // Update user with all settings
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name || undefined,
        ghostUrl,
        ghostApiKey,
        atprotoHandle,
        atprotoAppPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        ghostUrl: true,
        ghostApiKey: true,
        atprotoHandle: true,
        createdAt: true
      }
    });

    // Generate webhook URL for Ghost
    const webhookUrl = `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/ghost/webhook`;

    return res.json({
      success: true,
      user: updatedUser,
      webhookUrl,
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
        atprotoHandle: true,
        atprotoAppPassword: true,
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isComplete = !!(
      user.ghostUrl && 
      user.ghostApiKey && 
      user.atprotoHandle && 
      user.atprotoAppPassword
    );

    return res.json({
      isComplete,
      hasGhost: !!(user.ghostUrl && user.ghostApiKey),
      hasBluesky: !!(user.atprotoHandle && user.atprotoAppPassword),
    });

  } catch (error) {
    console.error('Wizard status error:', error);
    return res.status(500).json({ 
      error: 'Failed to check wizard status' 
    });
  }
});

export default router;

