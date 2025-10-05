import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { BskyAgent } from '@atproto/api';
import path from 'path';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const prisma = new PrismaClient();

// OAuth Client setup (TODO: Initialize when needed)
let oauthClient: NodeOAuthClient | null = null;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(cookieParser());
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files (for client-metadata.json)
app.use(express.static(path.join(__dirname, '../public')));

// Auth middleware
function authenticateToken(req: any, res: any, next: any) {
  const token = req.cookies.token || req.header('Authorization')?.replace('Bearer ', '');

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

// Helper: Get Bluesky agent for user (hybrid: OAuth or app password)
async function getAgentForUser(userId: string): Promise<BskyAgent | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { oauthSessions: { orderBy: { createdAt: 'desc' }, take: 1 } }
  });

  if (!user) return null;

  // Try OAuth first
  if (user.oauthSessions.length > 0 && oauthClient) {
    const session = user.oauthSessions[0];
    try {
      // Check if token is expired
      if (session.expiresAt > new Date()) {
        const agent = new BskyAgent({ service: process.env.ATPROTO_SERVICE || 'https://bsky.social' });
        // TODO: Implement DPoP token usage with OAuth client
        // For now, this is a placeholder for OAuth token restoration
        console.log('OAuth session available but token restoration needs implementation');
      }
    } catch (error) {
      console.error('OAuth session restore failed:', error);
    }
  }

  // Fallback to app password
  if (user.atprotoHandle && user.atprotoAppPassword) {
    try {
      const agent = new BskyAgent({ service: process.env.ATPROTO_SERVICE || 'https://bsky.social' });
      await agent.login({
        identifier: user.atprotoHandle,
        password: user.atprotoAppPassword,
      });
      return agent;
    } catch (error) {
      console.error('App password login failed:', error);
      return null;
    }
  }

  return null;
}

// Helper: Post to Bluesky
async function postToBluesky(agent: BskyAgent, text: string, url?: string) {
  const postText = url ? `${text}\n\n${url}` : text;
  const maxLength = 300;
  const truncated = postText.length > maxLength ? postText.slice(0, maxLength - 3) + '...' : postText;

  return await agent.post({
    text: truncated,
    createdAt: new Date().toISOString(),
  });
}

// Ghost webhook - must come BEFORE express.json()
app.post(
  '/api/ghost/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const secret = process.env.GHOST_WEBHOOK_SECRET;
      const signatureHeader = req.header('X-Ghost-Signature') || '';
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      const userIdHeader = req.header('X-User-ID'); // Custom header to identify which user this webhook is for

      // Optional signature verification
      if (secret) {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(rawBody);
        const expected = `sha256=${hmac.digest('hex')}`;
        const provided = signatureHeader.trim();

        const expectedBuf = Buffer.from(expected, 'utf8');
        const providedBuf = Buffer.from(provided, 'utf8');
        const valid =
          expectedBuf.length === providedBuf.length &&
          crypto.timingSafeEqual(expectedBuf, providedBuf);

        if (!valid) {
          console.warn('Ghost webhook signature verification failed');
          return res.status(401).json({ ok: false });
        }
      }

      // Parse JSON
      let payload: any = {};
      try {
        const text = rawBody.toString('utf8');
        payload = text ? JSON.parse(text) : {};
      } catch (e) {
        console.warn('Ghost webhook JSON parse error');
        return res.status(400).json({ ok: false });
      }

      const evt = String(payload?.post?.current?.event || payload?.event || 'unknown');
      const ghostEntityId = payload?.post?.current?.id || payload?.post?.id || null;
      console.log('✅ Ghost webhook received', { event: evt, id: ghostEntityId, userId: userIdHeader });

      // Process webhook asynchronously
      (async () => {
        try {
          // Find user by header or use default
          let userId = userIdHeader || process.env.DEFAULT_USER_ID || null;

          if (!userId) {
            const firstUser = await prisma.user.findFirst();
            if (!firstUser) {
              throw new Error('No user found to process webhook');
            }
            userId = firstUser.id;
          }

          // Verify user exists
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (!user) {
            throw new Error(`User ${userId} not found`);
          }

          // Handle post events
          const postPayload = payload?.post?.current || payload?.post;
          if (postPayload && ghostEntityId) {
            const action = evt.toLowerCase();
            const isPublished = action.includes('published');

            if (isPublished) {
              const title = postPayload.title || 'Untitled';
              const content = postPayload.html || postPayload.plaintext || '';
              const slug = postPayload.slug || undefined;
              const ghostSlug = postPayload.slug || null;
              const ghostUrl = postPayload.url || null;

              // Upsert post in database
              const post = await prisma.post.upsert({
                where: { ghostId: String(ghostEntityId) },
                update: {
                  title,
                  content,
                  slug: slug || (ghostSlug ? `${ghostSlug}` : undefined) || `ghost-${ghostEntityId}`,
                  status: 'published',
                  publishedAt: new Date(),
                  ghostSlug: ghostSlug || undefined,
                  ghostUrl: ghostUrl || undefined,
                },
                create: {
                  title,
                  content,
                  slug: slug || (ghostSlug ? `${ghostSlug}` : `ghost-${ghostEntityId}`),
                  status: 'published',
                  publishedAt: new Date(),
                  ghostId: String(ghostEntityId),
                  ghostSlug: ghostSlug || undefined,
                  ghostUrl: ghostUrl || undefined,
                  userId: userId,
                }
              });

              // Post to Bluesky
              const agent = await getAgentForUser(userId);
              if (agent) {
                try {
                  const result = await postToBluesky(agent, title, ghostUrl || undefined);

                  // Update post with ATProto data
                  await prisma.post.update({
                    where: { id: post.id },
                    data: {
                      atprotoUri: result.uri,
                      atprotoCid: result.cid,
                    }
                  });

                  await prisma.syncLog.create({
                    data: {
                      action: 'publish',
                      status: 'success',
                      source: 'ghost',
                      target: 'atproto',
                      ghostId: ghostEntityId,
                      atprotoUri: result.uri,
                      postId: post.id,
                      userId: userId
                    }
                  });

                  console.log('✅ Posted to Bluesky:', result.uri);
                } catch (error) {
                  console.error('Failed to post to Bluesky:', error);
                  await prisma.syncLog.create({
                    data: {
                      action: 'publish',
                      status: 'error',
                      source: 'ghost',
                      target: 'atproto',
                      ghostId: ghostEntityId,
                      postId: post.id,
                      error: error instanceof Error ? error.message : 'Unknown error',
                      userId: userId
                    }
                  });
                }
              } else {
                console.warn('No Bluesky credentials configured for user', userId);
              }
            }
          }
        } catch (err) {
          console.error('Webhook processing error:', err);
        }
      })();

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Webhook handler error:', error);
      return res.status(200).json({ ok: true });
    }
  }
);

// Generic JSON body parser
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Ghost ATProto Backend is running!' });
});

// Authentication Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // For now, simple email-based login (will add proper password hashing later)
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Auto-create user on first login
      user = await prisma.user.create({
        data: { email, name: email.split('@')[0] }
      });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        atprotoHandle: user.atprotoHandle,
        ghostUrl: user.ghostUrl
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: (req as any).userId },
      select: {
        id: true,
        email: true,
        name: true,
        atprotoHandle: true,
        ghostUrl: true,
        ghostApiKey: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.put('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { name, atprotoHandle, atprotoAppPassword, ghostUrl, ghostApiKey } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name !== undefined ? name : undefined,
        atprotoHandle: atprotoHandle !== undefined ? atprotoHandle : undefined,
        atprotoAppPassword: atprotoAppPassword !== undefined ? atprotoAppPassword : undefined,
        ghostUrl: ghostUrl !== undefined ? ghostUrl : undefined,
        ghostApiKey: ghostApiKey !== undefined ? ghostApiKey : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        atprotoHandle: true,
        ghostUrl: true,
        ghostApiKey: true,
        createdAt: true
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Get current user's posts
app.get('/api/auth/posts', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const posts = await prisma.post.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get current user's sync logs
app.get('/api/auth/logs', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const logs = await prisma.syncLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// OAuth Routes
app.get('/api/oauth/authorize', async (req, res) => {
  const { handle, userId } = req.query;

  if (!handle || !userId) {
    return res.status(400).json({ error: 'handle and userId are required' });
  }

  try {
    // Store state in session/database for callback
    const state = crypto.randomBytes(16).toString('hex');

    // TODO: Store state with userId for callback verification

    // For now, redirect to Bluesky with instructions
    // Full OAuth implementation requires proper state management
    res.json({
      message: 'OAuth flow initialization',
      nextSteps: 'Full OAuth implementation in progress. Use app password for now.',
      handle,
      userId
    });
  } catch (error) {
    res.status(500).json({ error: 'OAuth initialization failed' });
  }
});

app.get('/api/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  // TODO: Implement OAuth callback handling with token exchange
  res.json({ message: 'OAuth callback - implementation in progress' });
});

// User Management Routes
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        atprotoHandle: true,
        ghostUrl: true,
        createdAt: true,
      }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { email, name, atprotoHandle, atprotoAppPassword, ghostUrl, ghostApiKey } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        atprotoHandle: atprotoHandle || null,
        atprotoAppPassword: atprotoAppPassword || null,
        ghostUrl: ghostUrl || null,
        ghostApiKey: ghostApiKey || null,
      }
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, atprotoHandle, atprotoAppPassword, ghostUrl, ghostApiKey } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        atprotoHandle: atprotoHandle !== undefined ? atprotoHandle : undefined,
        atprotoAppPassword: atprotoAppPassword !== undefined ? atprotoAppPassword : undefined,
        ghostUrl: ghostUrl !== undefined ? ghostUrl : undefined,
        ghostApiKey: ghostApiKey !== undefined ? ghostApiKey : undefined,
      }
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        oauthSessions: {
          select: {
            id: true,
            sub: true,
            expiresAt: true,
            createdAt: true,
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Posts Routes
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Sync Logs
app.get('/api/sync-logs', async (req, res) => {
  try {
    const { userId } = req.query;
    const logs = await prisma.syncLog.findMany({
      where: userId ? { userId: String(userId) } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

// Mount all routes on /bridge as well (for nginx proxy)
const bridgeApp = express.Router();
bridgeApp.use(app._router);

// Create a new app that handles both root and /bridge prefix
const finalApp = express();
finalApp.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
finalApp.use('/bridge', app);
finalApp.use('/', app);

// Start server
finalApp.listen(port, () => {
  console.log(`🚀 Backend server running on http://localhost:${port}`);
  console.log(`📝 Available at both:`);
  console.log(`   - http://localhost:${port}/api/health`);
  console.log(`   - http://localhost:${port}/bridge/api/health`);
  console.log(`🔐 Configure Ghost webhook with X-User-ID header`);
});
