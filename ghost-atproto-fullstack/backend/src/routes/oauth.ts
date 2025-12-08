import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { initiateBlueskyLogin, handleBlueskyCallback, getBlueskyOAuthClient } from '../lib/bluesky-oauth';
import { oauthConfig } from '../lib/oauth-config';
import axios from 'axios';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

// ==================== Google OAuth Routes ====================

/**
 * Initiate Google OAuth flow
 * GET /api/auth/google
 */
router.get('/google', (req, res, next) => {
  // Make callback URL dynamic based on request origin
  const xForwardedHost = req.get('x-forwarded-host');
  const regularHost = req.get('host');
  const requestHost = xForwardedHost || regularHost || 'localhost:5000';

  console.log('[Google OAuth DEBUG] All headers:', {
    'x-forwarded-host': xForwardedHost,
    'host': regularHost,
    'x-forwarded-proto': req.get('x-forwarded-proto'),
    'x-forwarded-ssl': req.get('x-forwarded-ssl'),
    'x-forwarded-for': req.get('x-forwarded-for'),
    'origin': req.get('origin'),
    'referer': req.get('referer'),
    'protocol': req.protocol,
    'secure': req.secure,
    'selectedHost': requestHost
  });

  // Detect protocol - prioritize x-forwarded-proto (set by nginx/proxy)
  // Also check if the original request was secure
  let requestProtocol = req.get('x-forwarded-proto');

  // If not set by proxy, check other indicators
  if (!requestProtocol) {
    // Check if connection was secure
    if (req.secure || req.get('x-forwarded-ssl') === 'on') {
      requestProtocol = 'https';
    } else {
      // Check if host indicates HTTPS (common domains)
      const host = requestHost.toLowerCase();
      if (host.includes('linkedtrust.us') || host.includes('bridge.linkedtrust.us')) {
        requestProtocol = 'https';
      } else {
        requestProtocol = req.protocol || 'http';
      }
    }
  }

  // Normalize protocol (remove trailing slash, ensure lowercase)
  requestProtocol = requestProtocol?.toLowerCase().replace(/\/$/, '') || 'https';

  const dynamicCallbackURL = `${requestProtocol}://${requestHost}/api/auth/google/callback`;

  console.log('[Google OAuth] Final computed values:', {
    detectedProtocol: requestProtocol,
    detectedHost: requestHost,
    callbackURL: dynamicCallbackURL,
    trustProxy: req.app.get('trust proxy')
  });
  
  // Manually construct Google OAuth URL with dynamic callback
  const params = new URLSearchParams({
    client_id: oauthConfig.google.clientId,
    redirect_uri: dynamicCallbackURL,
    response_type: 'code',
    scope: 'profile email',
    access_type: 'offline',
    prompt: 'consent',
  });
  
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  console.log('[Google OAuth] Redirecting to Google with URL:', googleAuthUrl);
  console.log('[Google OAuth] redirect_uri parameter:', dynamicCallbackURL);

  res.redirect(googleAuthUrl);
});

/**
 * Google OAuth callback
 * GET /api/auth/google/callback
 */
router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (error) {
      console.error('[Google OAuth] Error from Google:', error);
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }

    if (!code) {
      return res.redirect(`${frontendUrl}/login?error=no_code`);
    }

    // Get dynamic callback URL from request (must match the one used in /google route)
    const xForwardedHost = req.get('x-forwarded-host');
    const regularHost = req.get('host');
    const requestHost = xForwardedHost || regularHost || 'localhost:5000';

    console.log('[Google OAuth Callback DEBUG] All headers:', {
      'x-forwarded-host': xForwardedHost,
      'host': regularHost,
      'x-forwarded-proto': req.get('x-forwarded-proto'),
      'x-forwarded-ssl': req.get('x-forwarded-ssl'),
      'x-forwarded-for': req.get('x-forwarded-for'),
      'origin': req.get('origin'),
      'referer': req.get('referer'),
      'protocol': req.protocol,
      'secure': req.secure,
      'selectedHost': requestHost
    });

    // Detect protocol - prioritize x-forwarded-proto (set by nginx/proxy)
    // Also check if the original request was secure
    let requestProtocol = req.get('x-forwarded-proto');

    // If not set by proxy, check other indicators
    if (!requestProtocol) {
      // Check if connection was secure
      if (req.secure || req.get('x-forwarded-ssl') === 'on') {
        requestProtocol = 'https';
      } else {
        // Check if host indicates HTTPS (common domains)
        const host = requestHost.toLowerCase();
        if (host.includes('linkedtrust.us') || host.includes('bridge.linkedtrust.us')) {
          requestProtocol = 'https';
        } else {
          requestProtocol = req.protocol || 'http';
        }
      }
    }

    // Normalize protocol (remove trailing slash, ensure lowercase)
    requestProtocol = requestProtocol?.toLowerCase().replace(/\/$/, '') || 'https';

    const dynamicCallbackURL = `${requestProtocol}://${requestHost}/api/auth/google/callback`;

    console.log('[Google OAuth Callback] Final computed values:', {
      detectedProtocol: requestProtocol,
      detectedHost: requestHost,
      callbackURL: dynamicCallbackURL,
      trustProxy: req.app.get('trust proxy')
    });

    // Exchange authorization code for access token
    console.log('[Google OAuth] Exchanging code for token...');
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: oauthConfig.google.clientId,
      client_secret: oauthConfig.google.clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: dynamicCallbackURL,
    });

    const { access_token } = tokenResponse.data;

    // Get user profile from Google
    console.log('[Google OAuth] Fetching user profile...');
    const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const profile = profileResponse.data;
    const email = profile.email;
    const name = profile.name;
    const picture = profile.picture;

    if (!email) {
      return res.redirect(`${frontendUrl}/login?error=no_email`);
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        password: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!user) {
      // Create new user for Google OAuth
      user = await prisma.user.create({
        data: {
          email,
          name,
          role: 'USER',
          password: '', // OAuth users don't need password
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          password: true,
          createdAt: true,
          updatedAt: true,
        }
      });
    } else {
      // Update existing user's name if needed
      if (name && user.name !== name) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { name },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            password: true,
            createdAt: true,
            updatedAt: true,
          }
        });
      }
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // Set cookie with proper settings for cross-origin
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
  } catch (error: any) {
    console.error('[Google OAuth] Callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/login?error=callback_failed`);
  }
});

// ==================== Bluesky OAuth Routes ====================

/**
 * Initiate Bluesky OAuth flow (AT Protocol OAuth)
 * GET /api/auth/bluesky?handle=user.bsky.social
 */
router.get('/bluesky', async (req, res) => {
  try {
    const { handle } = req.query;

    if (!handle || typeof handle !== 'string') {
      return res.status(400).json({
        error: 'Bluesky handle is required as query parameter',
        example: '/api/auth/bluesky?handle=user.bsky.social'
      });
    }

    // Check if OAuth is configured
    const oauthClient = getBlueskyOAuthClient();
    if (!oauthClient) {
      return res.status(503).json({
        error: 'Bluesky OAuth not configured',
        hint: 'OAuth requires HTTPS and a production domain. Set APP_URL environment variable.',
        developmentNote: 'For local development, use app password endpoint: POST /api/auth/bluesky/dev'
      });
    }

    try {
      const authUrl = await initiateBlueskyLogin(handle);

      // Redirect to Bluesky authorization
      res.redirect(authUrl);
    } catch (oauthError) {
      console.error('Bluesky OAuth initiation failed:', oauthError);
      return res.status(500).json({
        error: 'Failed to initiate Bluesky OAuth',
        message: oauthError instanceof Error ? oauthError.message : 'Unknown error'
      });
    }
  } catch (error: any) {
    console.error('Bluesky OAuth error:', error);
    res.status(500).json({
      error: 'Bluesky OAuth failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Development-only: App password authentication
 * POST /api/auth/bluesky/dev
 * Body: { handle: "user.bsky.social", password: "app-password" }
 */
router.post('/bluesky/dev', async (req, res) => {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'App password authentication is disabled in production',
      hint: 'Use OAuth: GET /api/auth/bluesky?handle=your.handle'
    });
  }

  try {
    const { handle, password } = req.body;

    if (!handle || !password) {
      return res.status(400).json({
        error: 'Bluesky handle and app password are required',
        hint: 'Generate an app password at https://bsky.app/settings/app-passwords'
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
      secure: false, // Development only
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, blueskyHandle: user.blueskyHandle, role: user.role },
      token,
    });
  } catch (error: any) {
    console.error('Bluesky dev login error:', error);
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
  const requestHost = req.get('x-forwarded-host') || req.get('host') || '';
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
  
  // Check if Bluesky OAuth is configured
  const blueskyOAuthClient = getBlueskyOAuthClient();
  const isBlueskyOAuthEnabled = !!blueskyOAuthClient;

  res.json({
    google: {
      enabled: googleEnabled,
      buttonText: 'Continue with Google',
    },
    bluesky: {
      enabled: isBlueskyOAuthEnabled,
      buttonText: 'Continue with Bluesky',
      requiresHandle: true,
      requiresPassword: false, // OAuth for login (app passwords only for posting permissions)
      handlePlaceholder: 'your-handle.bsky.social',
      oauthOnly: true,
      devNote: !isBlueskyOAuthEnabled ? 'OAuth requires HTTPS domain. For local dev, use POST /api/auth/bluesky/dev' : undefined,
    },
  });
});

export default router;

