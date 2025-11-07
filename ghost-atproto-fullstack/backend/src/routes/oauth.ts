import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { initiateBlueskyLogin, handleBlueskyCallback, getBlueskyOAuthClient } from '../lib/bluesky-oauth';
import { oauthConfig } from '../lib/oauth-config';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ==================== Google OAuth Routes ====================

/**
 * Initiate Google OAuth flow
 * GET /api/auth/google
 */
router.get('/google', (req, res, next) => {
  // Make callback URL dynamic based on request origin
  const requestHost = req.get('host') || req.get('x-forwarded-host') || 'localhost:5000';
  const requestProtocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  const dynamicCallbackURL = `${requestProtocol}://${requestHost}/api/auth/google/callback`;
  
  console.log('[Google OAuth] Dynamic callback URL:', dynamicCallbackURL);
  
  // Override callbackURL for this request
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    callbackURL: dynamicCallbackURL,
  })(req, res, next);
});

/**
 * Google OAuth callback
 * GET /api/auth/google/callback
 */
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/login?error=google_auth_failed',
    session: false 
  }),
  (req, res) => {
    try {
      const user = req.user as any;

      if (!user) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/login?error=no_user`);
      }

      // Generate JWT token
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

      // Set cookie with proper settings for cross-origin
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const isProduction = process.env.NODE_ENV === 'production';
      
      // Set cookie on backend domain
      res.cookie('token', token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      // Also pass token in URL for frontend to store in localStorage
      // This is a fallback for cross-origin cookie issues
      let redirectPath = '/dashboard';
      if (user.role === 'ADMIN') {
        redirectPath = '/dashboard/civic-actions';
      } else if (user.role === 'AUTHOR') {
        redirectPath = '/bridge/wizard';
      }

      // Redirect with token in URL - frontend will extract and store it
      res.redirect(`${frontendUrl}${redirectPath}?token=${encodeURIComponent(token)}`);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/login?error=callback_failed`);
    }
  }
);

// ==================== Bluesky OAuth Routes ====================

/**
 * Bluesky login - OAuth if configured, otherwise app password
 * POST /api/auth/bluesky
 * Body: { handle: "user.bsky.social", password?: "app-password" }
 */
router.post('/bluesky', async (req, res) => {
  try {
    const { handle, password } = req.body;

    if (!handle) {
      return res.status(400).json({ 
        error: 'Bluesky handle is required',
        example: 'user.bsky.social' 
      });
    }

    // Try OAuth first (if configured for production)
    const oauthClient = getBlueskyOAuthClient();
    if (oauthClient && !password) {
      try {
        const authUrl = await initiateBlueskyLogin(handle);
        return res.json({ authUrl });
      } catch (oauthError) {
        console.log('OAuth not available, falling back to app password');
      }
    }

    // Fallback: App password authentication
    if (!password) {
      return res.status(400).json({ 
        error: 'Bluesky app password is required for development',
        hint: 'Generate an app password at https://bsky.app/settings/app-passwords',
        needsPassword: true
      });
    }

    // App password login
    const { BskyAgent } = await import('@atproto/api');
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: handle, password });

    const profile = await agent.getProfile({ actor: agent.session?.did || handle });
    const did = agent.session?.did || '';
    const displayName = profile.data.displayName || handle;

    const email = `${handle.replaceAll('.', '_')}@bsky.social`;
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: displayName, blueskyHandle: handle, blueskyPassword: password, blueskyDid: did },
      });
    } else {
      user = await prisma.user.create({
        data: { email, name: displayName, role: 'USER', blueskyHandle: handle, blueskyPassword: password, blueskyDid: did, password: '' },
      });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, blueskyHandle: user.blueskyHandle, role: user.role },
      token,
    });
  } catch (error: any) {
    console.error('Bluesky login error:', error);
    if (error.message?.includes('Invalid identifier or password')) {
      return res.status(401).json({ error: 'Invalid Bluesky credentials' });
    }
    res.status(500).json({ error: 'Bluesky login failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * Bluesky OAuth callback (following statusphere example)
 * GET /api/auth/bluesky/callback
 */
router.get('/bluesky/callback', async (req, res) => {
  try {
    // Get OAuth params from URL
    const params = new URLSearchParams(req.url.split('?')[1]);

    // Complete OAuth flow exactly like statusphere
    const { user } = await handleBlueskyCallback(params);

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Redirect to dashboard
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    let redirectPath = '/dashboard';
    if (user.role === 'ADMIN') {
      redirectPath = '/dashboard/civic-actions';
    } else if (user.role === 'AUTHOR') {
      redirectPath = '/bridge/wizard';
    }

    res.redirect(`${frontendUrl}${redirectPath}`);
  } catch (error) {
    console.error('Bluesky OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/login?error=bluesky_auth_failed`);
  }
});

// ==================== OAuth Info Route ====================

/**
 * Get OAuth configuration info (for frontend)
 * GET /api/auth/oauth/config
 */
router.get('/oauth/config', (req, res) => {
  const isGoogleEnabled = !!(oauthConfig.google.clientId && oauthConfig.google.clientSecret);
  
  // Get request origin/host - check multiple headers for proxy/load balancer scenarios
  const requestHost = req.get('host') || req.get('x-forwarded-host') || '';
  const requestProtocol = req.get('x-forwarded-proto') || req.get('x-forwarded-protocol') || req.protocol || 'http';
  const requestOrigin = req.get('origin') || `${requestProtocol}://${requestHost}`;
  
  // Extract origin from callback URL
  const callbackUrl = oauthConfig.google.callbackURL;
  let callbackOrigin = '';
  let callbackHost = '';
  try {
    const callbackUrlObj = new URL(callbackUrl);
    callbackOrigin = callbackUrlObj.origin;
    callbackHost = callbackUrlObj.host;
  } catch (e) {
    // Invalid URL, skip origin check
  }
  
  // Debug logging (can be removed in production)
  console.log('[OAuth Config] Request:', {
    host: requestHost,
    origin: requestOrigin,
    protocol: requestProtocol,
    callbackUrl,
    callbackOrigin,
    callbackHost,
    hasCredentials: isGoogleEnabled
  });
  
  // Google OAuth is enabled if credentials exist
  // The callback URL validation is handled by Google Cloud Console
  // We just need to ensure credentials are configured
  // Note: Both callback URLs (for IP and domain) should be registered in Google Cloud Console
  const googleEnabled = isGoogleEnabled && (
    // If credentials exist, enable Google OAuth
    // The callback URL will be validated by Google, not by us
    // This allows the same backend to serve multiple domains/IPs
    true
  );
  
  console.log('[OAuth Config] Google enabled:', googleEnabled);
  
  res.json({
    google: {
      enabled: googleEnabled,
      buttonText: 'Continue with Google',
    },
    bluesky: {
      enabled: true,
      buttonText: 'Continue with Bluesky',
      requiresHandle: true,
      requiresPassword: true, // App passwords for development, OAuth for production
      handlePlaceholder: 'your-handle.bsky.social',
      passwordPlaceholder: 'App Password',
    },
  });
});

export default router;

