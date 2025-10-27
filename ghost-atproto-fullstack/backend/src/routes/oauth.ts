import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { 
    initiateOAuthLogin, 
    handleOAuthCallback, 
    getAgentForDid, 
    revokeSession 
} from '../lib/oauth-atproto';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SHARED_SECRET = process.env.SHARED_JWT_SECRET || 'change-in-production';
const GHOST_URL = process.env.GHOST_URL || 'http://localhost:2368';

// ==================== Google OAuth Routes ====================

/**
 * Initiate Google OAuth flow
 * GET /api/auth/google
 */
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
}));

/**
 * Google OAuth callback
 * GET /api/auth/google/callback
 */
router.get('/google/callback',
    passport.authenticate('google', { 
        failureRedirect: `${GHOST_URL}/signin?error=google_auth_failed`,
        session: false 
    }),
    (req, res) => {
        try {
            const user = req.user as any;

            if (!user) {
                return res.redirect(`${GHOST_URL}/signin?error=no_user`);
            }

            // Create token for Ghost
            const token = jwt.sign({ 
                userId: user.id,
                email: user.email,
                name: user.name,
                provider: 'google'
            }, SHARED_SECRET, { expiresIn: '1h' });

            // Redirect back to Ghost with token
            res.redirect(`${GHOST_URL}/members/api/oauth/callback?token=${encodeURIComponent(token)}&provider=google`);
        } catch (error) {
            console.error('Google OAuth callback error:', error);
            res.redirect(`${GHOST_URL}/signin?error=google_callback_failed`);
        }
    }
);

// ==================== ATProto OAuth Routes ====================

/**
 * Initiate ATProto OAuth flow (called from Ghost)
 * GET /api/auth/atproto/init?handle=user.bsky.social&ghost_callback=true
 */
router.get('/atproto/init', async (req, res) => {
    try {
        const { handle, ghost_callback } = req.query;

        if (!handle) {
            return res.redirect(`${GHOST_URL}/signin?error=handle_required`);
        }

        // Store ghost_callback flag in session for callback
        if (ghost_callback) {
            res.cookie('ghost_callback', 'true', {
                httpOnly: true,
                maxAge: 10 * 60 * 1000 // 10 minutes
            });
        }

        const authUrl = await initiateOAuthLogin(handle as string);
        res.redirect(authUrl);
    } catch (error: any) {
        console.error('ATProto OAuth initiation error:', error);
        res.redirect(`${GHOST_URL}/signin?error=oauth_init_failed`);
    }
});

/**
 * Initiate ATProto OAuth flow (API endpoint for SPA)
 * POST /api/auth/atproto
 */
router.post('/atproto', async (req, res) => {
    try {
        const { handle } = req.body;

        if (!handle) {
            return res.status(400).json({ 
                error: 'Handle is required',
                example: 'user.bsky.social' 
            });
        }

        const authUrl = await initiateOAuthLogin(handle);
        return res.json({ authUrl });
    } catch (error: any) {
        console.error('ATProto OAuth initiation error:', error);
        return res.status(500).json({ 
            error: 'Failed to initiate OAuth',
            message: error.message 
        });
    }
});

/**
 * ATProto OAuth callback
 * GET /api/auth/callback
 */
router.get('/callback', async (req, res) => {
    try {
        // Get OAuth params from query string
        const params = new URLSearchParams(req.url.split('?')[1]);
        
        // Handle the OAuth callback
        const { user, session } = await handleOAuthCallback(params);
        
        // Check if this is a Ghost callback
        const isGhostCallback = req.cookies.ghost_callback === 'true';
        
        if (isGhostCallback) {
            // Clear the ghost_callback cookie
            res.clearCookie('ghost_callback');
            
            // Create token for Ghost
            const token = jwt.sign({ 
                userId: user.id,
                did: session.did,
                handle: user.blueskyHandle,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                provider: 'atproto'
            }, SHARED_SECRET, { expiresIn: '1h' });
            
            // Redirect back to Ghost with token
            res.redirect(`${GHOST_URL}/members/api/oauth/callback?token=${encodeURIComponent(token)}&provider=atproto`);
        } else {
            // Regular SPA flow
            const token = jwt.sign({ 
                userId: user.id,
                did: session.did,
                provider: 'atproto'
            }, JWT_SECRET, { expiresIn: '7d' });
            
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });
            
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            
            if (!user.email) {
                res.cookie('temp_did', session.did, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 10 * 60 * 1000
                });
                res.redirect(`${frontendUrl}/welcome/email`);
            } else {
                res.redirect(`${frontendUrl}/dashboard`);
            }
        }
    } catch (error) {
        console.error('ATProto OAuth callback error:', error);
        
        // Check if Ghost callback
        const isGhostCallback = req.cookies.ghost_callback === 'true';
        res.clearCookie('ghost_callback');
        
        if (isGhostCallback) {
            res.redirect(`${GHOST_URL}/signin?error=oauth_failed`);
        } else {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            res.redirect(`${frontendUrl}/login?error=oauth_failed`);
        }
    }
});

/**
 * Verify Ghost session token (for bridge to verify Ghost users)
 * POST /api/auth/verify-ghost-session
 */
router.post('/verify-ghost-session', (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ error: 'Token required' });
        }
        
        const sessionData = jwt.verify(token, SHARED_SECRET);
        res.json({ valid: true, session: sessionData });
    } catch (error) {
        res.status(401).json({ valid: false, error: 'Invalid token' });
    }
});

// ==================== Email Collection (for SPA) ====================

/**
 * Collect email for ATProto users (optional for newsletter)
 * POST /api/auth/email
 */
router.post('/email', async (req, res) => {
    try {
        const { email, subscribe } = req.body;
        const tempDid = req.cookies.temp_did;
        
        if (!tempDid) {
            return res.status(400).json({ error: 'No temporary session found' });
        }
        
        // Update user with email
        const user = await prisma.user.update({
            where: { blueskyDid: tempDid },
            data: { 
                email,
                newsletterSubscribed: subscribe || false
            }
        });
        
        // Clear temp cookie
        res.clearCookie('temp_did');
        
        res.json({ success: true, user: { id: user.id, email: user.email } });
    } catch (error) {
        console.error('Email collection error:', error);
        res.status(500).json({ error: 'Failed to save email' });
    }
});

/**
 * Skip email collection
 * POST /api/auth/skip-email
 */
router.post('/skip-email', async (req, res) => {
    const tempDid = req.cookies.temp_did;
    
    if (!tempDid) {
        return res.status(400).json({ error: 'No temporary session found' });
    }
    
    // Clear temp cookie
    res.clearCookie('temp_did');
    res.json({ success: true });
});

// ==================== Session Management ====================

/**
 * Logout / Revoke session
 * POST /api/auth/logout
 */
router.post('/logout', async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.json({ success: true });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        
        // If it's an ATProto session, revoke it properly
        if (decoded.did) {
            await revokeSession(decoded.did);
        }
        
        res.clearCookie('token');
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.clearCookie('token');
        res.json({ success: true });
    }
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                email: true,
                name: true,
                blueskyHandle: true,
                blueskyDid: true,
                avatar: true,
                role: true,
                newsletterSubscribed: true
            }
        });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // If ATProto user, check if session is still valid
        if (user.blueskyDid && decoded.did) {
            const agent = await getAgentForDid(decoded.did);
            if (!agent) {
                res.clearCookie('token');
                return res.status(401).json({ error: 'Session expired' });
            }
        }
        
        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
});

export default router;
