import express from 'express';
import cors from 'cors';
import morgan from 'morgan'
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { BskyAgent, RichText } from '@atproto/api';
import path from 'path';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import atprotoRoutes from './routes/atproto';
import wizardRoutes from './routes/wizard';
import axios from 'axios';

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
app.use(morgan('dev'));

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3001', // Allow port 3001 as well
    'http://localhost:3000'
  ],
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
  if (user.blueskyHandle && user.blueskyPassword) {
    try {
      const agent = new BskyAgent({ service: process.env.ATPROTO_SERVICE || 'https://bsky.social' });
      await agent.login({
        identifier: user.blueskyHandle,
        password: user.blueskyPassword,
      });
      return agent;
    } catch (error) {
      console.error('App password login failed:', error);
      return null;
    }
  }

  return null;
}

// Helper: Post to Bluesky with clickable links and better content formatting
async function postToBluesky(agent: BskyAgent, title: string, content?: string, url?: string) {
  // Strip HTML tags and get clean text from content
  const cleanContent = content 
    ? content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    : '';
  
  // Create a better formatted post with maximum content
  // Bluesky limit is 300 chars, so we maximize the content
  const urlText = url ? `\n\n🔗 ${url}` : '';
  const titleText = `${title}\n\n`;
  const maxContentLength = 300 - titleText.length - urlText.length;
  
  let contentToPost = cleanContent;
  if (contentToPost.length > maxContentLength) {
    contentToPost = contentToPost.substring(0, maxContentLength - 3) + '...';
  }
  
  const postText = `${titleText}${contentToPost}${urlText}`;

  // Use RichText to detect and create link facets
  const rt = new RichText({ text: postText });
  await rt.detectFacets(agent);

  return await agent.post({
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  });
}

// Helper: Sync Ghost posts to Bluesky
async function syncGhostToBluesky(
  userId: string,
  ghostUrl: string,
  ghostApiKey: string,
  blueskyHandle: string,
  blueskyPassword: string,
  limit: number = 50,
  force: boolean = false
) {
  try {
    console.log(`\n🔄 Starting sync for ${ghostUrl} (user: ${userId})...`);

    // 1. Authenticate with Bluesky
    const agent = new BskyAgent({ 
      service: process.env.ATPROTO_SERVICE || 'https://bsky.social' 
    });
    
    await agent.login({
      identifier: blueskyHandle,
      password: blueskyPassword,
    });
    
    console.log(`🦋 Authenticated as ${blueskyHandle}`);

    // 2. Fetch Ghost posts using Admin API
    const [keyId, keySecret] = ghostApiKey.split(':');
    if (!keyId || !keySecret) {
      throw new Error('Invalid Ghost API key format');
    }

    // Create JWT token for Ghost Admin API
    const token = jwt.sign({}, Buffer.from(keySecret, 'hex'), {
      keyid: keyId,
      algorithm: 'HS256',
      expiresIn: '5m',
      audience: `/admin/`
    });

    const ghostApiUrl = `${ghostUrl}/ghost/api/admin/posts/`;
    const response = await axios.get(ghostApiUrl, {
      headers: {
        'Authorization': `Ghost ${token}`,
        'Accept-Version': 'v5.0'
      },
      params: {
        limit,
        filter: 'status:published',
        order: 'published_at DESC',
        fields: 'id,title,slug,excerpt,custom_excerpt,html,plaintext,mobiledoc,lexical,feature_image,url,published_at',
        formats: 'html,plaintext,mobiledoc'  // Explicitly request all content formats
      }
    });

    const posts = response.data.posts || [];
    console.log(`📖 Found ${posts.length} posts`);

    let syncedCount = 0;
    let skippedCount = 0;

    // 3. Process each post
    for (const post of posts) {
      // Check if already shared (unless force is true)
      const existing = await prisma.post.findFirst({
        where: {
          ghostId: post.id,
          userId,
        }
      });

      if (existing && existing.atprotoUri && !force) {
        console.log(`⏭️  Skipping "${post.title}" - already shared`);
        skippedCount++;
        continue;
      }
      
      // If force is true and post exists, we'll update it with full content
      if (existing && force) {
        console.log(`🔄 Force updating "${post.title}" with full content...`);
      }

      // Create Bluesky post only if it doesn't already exist on Bluesky
      const excerpt = post.excerpt || post.custom_excerpt || '';
      const fullContent = post.html || post.plaintext || '';
      
      // Log content status for debugging
      console.log(`📝 Processing "${post.title}": Content length = ${fullContent.length} chars`);
      
      // Strip HTML tags and get clean text
      const cleanText = fullContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      
      // Create a better formatted post with more content
      // Bluesky limit is 300 chars, so we maximize the content
      const urlText = `\n\n🔗 ${post.url}`;
      const titleText = `${post.title}\n\n`;
      const maxContentLength = 300 - titleText.length - urlText.length;
      
      let contentToPost = excerpt || cleanText;
      if (contentToPost.length > maxContentLength) {
        contentToPost = contentToPost.substring(0, maxContentLength - 3) + '...';
      }
      
      const blueskyText = `${titleText}${contentToPost}${urlText}`;

      try {
        let blueskyResult;
        
        // Only post to Bluesky if not already posted
        if (!existing || !existing.atprotoUri) {
          // Use RichText to detect and create link facets for clickable links
          const rt = new RichText({ text: blueskyText });
          await rt.detectFacets(agent);

          blueskyResult = await agent.post({
            text: rt.text,
            facets: rt.facets,
            createdAt: new Date().toISOString(),
          });
        } else {
          // Use existing Bluesky URI if already posted
          blueskyResult = { uri: existing.atprotoUri, cid: existing.atprotoCid };
        }

        // Save to database with full content
        await prisma.post.upsert({
          where: { ghostId: post.id },
          update: {
            content: fullContent,
            excerpt: excerpt,
            featureImage: post.feature_image,
            atprotoUri: blueskyResult.uri,
            atprotoCid: blueskyResult.cid,
            status: 'published',
            publishedAt: new Date(post.published_at)
          },
          create: {
            title: post.title,
            content: fullContent,
            excerpt: excerpt,
            slug: post.slug,
            featureImage: post.feature_image,
            status: 'published',
            ghostId: post.id,
            ghostSlug: post.slug,
            ghostUrl: post.url,
            atprotoUri: blueskyResult.uri,
            atprotoCid: blueskyResult.cid,
            publishedAt: new Date(post.published_at),
            userId
          }
        });

        // Log the sync
        await prisma.syncLog.create({
          data: {
            action: 'publish',
            status: 'success',
            source: 'ghost',
            target: 'atproto',
            ghostId: post.id,
            atprotoUri: blueskyResult.uri,
            userId
          }
        });

        console.log(`✅ Shared "${post.title}" to Bluesky`);
        syncedCount++;

        // Rate limiting - wait 2 seconds between posts
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (postError) {
        console.error(`❌ Failed to share "${post.title}":`, postError);
        
        // Log the error
        await prisma.syncLog.create({
          data: {
            action: 'publish',
            status: 'error',
            source: 'ghost',
            target: 'atproto',
            ghostId: post.id,
            error: postError instanceof Error ? postError.message : 'Unknown error',
            userId
          }
        });
      }
    }

    console.log(`✨ Sync complete for ${ghostUrl}: ${syncedCount} synced, ${skippedCount} skipped\n`);
    
    return {
      success: true,
      syncedCount,
      skippedCount,
      totalProcessed: posts.length
    };

  } catch (error) {
    console.error(`❌ Sync error for ${ghostUrl}:`, error);
    throw error;
  }
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

          // Check if auto-sync is enabled for this user
          if (!user.autoSync) {
            console.log(`Auto-sync disabled for user ${userId}, skipping webhook processing`);
            return;
          }

          // Handle post events
          const postPayload = payload?.post?.current || payload?.post;
          if (postPayload && ghostEntityId) {
            const action = evt.toLowerCase();
            const isPublished = action.includes('published');

            if (isPublished) {
              const title = postPayload.title || 'Untitled';
              const content = postPayload.html || postPayload.plaintext || '';
              const excerpt = postPayload.excerpt || postPayload.custom_excerpt || '';
              const featureImage = postPayload.feature_image || null;
              const slug = postPayload.slug || undefined;
              const ghostSlug = postPayload.slug || null;
              const ghostUrl = postPayload.url || null;

              // Upsert post in database
              const post = await prisma.post.upsert({
                where: { ghostId: String(ghostEntityId) },
                update: {
                  title,
                  content,
                  excerpt,
                  featureImage,
                  slug: slug || (ghostSlug ? `${ghostSlug}` : undefined) || `ghost-${ghostEntityId}`,
                  status: 'published',
                  publishedAt: new Date(),
                  ghostSlug: ghostSlug || undefined,
                  ghostUrl: ghostUrl || undefined,
                },
                create: {
                  title,
                  content,
                  excerpt,
                  featureImage,
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
                  // Use excerpt if available, otherwise use content
                  const contentToSend = excerpt || content;
                  const result = await postToBluesky(agent, title, contentToSend, ghostUrl || undefined);

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

// Generic JSON body parser with increased limit for image uploads
app.use(express.json({ limit: '10mb' }));


// Routes
app.use('/api/atproto', atprotoRoutes);
app.use('/api/wizard', wizardRoutes);


app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Ghost ATProto Backend is running!' });
});

// Authentication Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
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
        blueskyHandle: user.blueskyHandle,
        ghostUrl: user.ghostUrl,
        role: user.role
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
        role: true,
        blueskyHandle: true,
        blueskyPassword: true,
        ghostUrl: true,
        ghostApiKey: true,
        ghostContentApiKey: true,
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

// Signup route: create user with chosen role
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, name, password, role } = req.body as { 
      email?: string; 
      name?: string; 
      password?: string;
      role?: 'USER' | 'AUTHOR' | 'ADMIN' 
    };

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Ensure email unique
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Validate role - ADMIN cannot be created via signup
    const normalizedRole = (role || 'USER').toUpperCase();
    if (!['USER', 'AUTHOR'].includes(normalizedRole)) {
      return res.status(400).json({ error: 'Invalid role. Use USER or AUTHOR.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        password: hashedPassword,
        role: normalizedRole as any,
      }
    });

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        blueskyHandle: user.blueskyHandle,
        ghostUrl: user.ghostUrl,
        role: user.role
      },
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.put('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { name, blueskyHandle, blueskyPassword, ghostUrl, ghostApiKey, ghostContentApiKey } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name !== undefined ? name : undefined,
        blueskyHandle: blueskyHandle !== undefined ? blueskyHandle : undefined,
        blueskyPassword: blueskyPassword !== undefined ? blueskyPassword : undefined,
        ghostUrl: ghostUrl !== undefined ? ghostUrl : undefined,
        ghostApiKey: ghostApiKey !== undefined ? ghostApiKey : undefined,
        ghostContentApiKey: ghostContentApiKey !== undefined ? ghostContentApiKey : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        blueskyHandle: true,
        blueskyPassword: true,
        ghostUrl: true,
        ghostApiKey: true,
        ghostContentApiKey: true,
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

// Get current user's profile stats
app.get('/api/auth/profile/stats', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    
    // Get total posts synced
    const totalPosts = await prisma.post.count({
      where: { userId, atprotoUri: { not: null } }
    });
    
    // Get successful syncs
    const successfulSyncs = await prisma.syncLog.count({
      where: { userId, status: 'success' }
    });
    
    // Get failed syncs
    const failedSyncs = await prisma.syncLog.count({
      where: { userId, status: 'error' }
    });
    
    // Get recent posts
    const recentPosts = await prisma.post.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    // Get recent logs
    const recentLogs = await prisma.syncLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    
    res.json({
      totalPosts,
      successfulSyncs,
      failedSyncs,
      recentPosts,
      recentLogs
    });
  } catch (error) {
    console.error('Profile stats error:', error);
    res.status(500).json({ error: 'Failed to fetch profile stats' });
  }
});

// Manual sync endpoint - sync Ghost posts to Bluesky
app.post('/api/auth/sync', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { limit, force } = req.body;

    // Get user credentials
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ghostUrl: true,
        ghostApiKey: true,
        ghostContentApiKey: true,
        blueskyHandle: true,
        blueskyPassword: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.ghostUrl || !user.ghostApiKey) {
      return res.status(400).json({ error: 'Ghost Admin API key and URL are required for syncing' });
    }

    if (!user.blueskyHandle || !user.blueskyPassword) {
      return res.status(400).json({ error: 'Bluesky credentials not configured' });
    }

    // Run sync with higher default limit (50 posts) and force option
    const result = await syncGhostToBluesky(
      userId,
      user.ghostUrl,
      user.ghostApiKey,
      user.blueskyHandle,
      user.blueskyPassword,
      limit || 50,
      force || false
    );

    res.json({
      message: 'Sync completed successfully',
      ...result
    });

  } catch (error) {
    console.error('Manual sync error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Sync failed' 
    });
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
        blueskyHandle: true,
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
    const { email, name, password, blueskyHandle, blueskyPassword, ghostUrl, ghostApiKey } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        password: hashedPassword,
        blueskyHandle: blueskyHandle || null,
        blueskyPassword: blueskyPassword || null,
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
    const { name, blueskyHandle, blueskyPassword, ghostUrl, ghostApiKey } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        blueskyHandle: blueskyHandle !== undefined ? blueskyHandle : undefined,
        blueskyPassword: blueskyPassword !== undefined ? blueskyPassword : undefined,
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

// Get single post by ID (public - anyone can read articles)
app.get('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            blueskyHandle: true,
          }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(post);
  } catch (error) {
    console.error('Fetch post error:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Sync Logs
// Civic Events (Mobilize API Proxy)
app.get('/api/civic-events', async (req, res) => {
  try {
    const { 
      cursor, 
      zipcode, 
      organization_id, 
      event_type, 
      event_types,
      state, 
      timeslot_start_after, 
      timeslot_start_before,
      timeslot_start,
      timeslot_end,
      is_virtual,
      exclude_full,
      max_dist,
      updated_since,
      visibility,
      high_priority_only,
      tag_id,
      event_campaign_id,
      approval_status
    } = req.query;
    
    // Build query params - handle cursor properly
    const params = new URLSearchParams();
    if (cursor) {
      // If cursor is a full URL, extract just the cursor value
      if (cursor.toString().startsWith('http')) {
        try {
          const url = new URL(cursor.toString());
          const cursorValue = url.searchParams.get('cursor');
          if (cursorValue) {
            params.append('cursor', cursorValue);
          }
        } catch (e) {
          console.error('Invalid cursor URL:', cursor);
        }
      } else {
        // If cursor is just the value, decode it first
        const decodedCursor = decodeURIComponent(cursor as string);
        params.append('cursor', decodedCursor);
      }
    }
    
    // Basic filters
    if (zipcode) params.append('zipcode', zipcode as string);
    if (organization_id) params.append('organization_id', organization_id as string);
    if (state) params.append('state', state as string);
    if (updated_since) params.append('updated_since', updated_since as string);
    if (visibility) params.append('visibility', visibility as string);
    if (max_dist) params.append('max_dist', max_dist as string);
    if (event_campaign_id) params.append('event_campaign_id', event_campaign_id as string);
    
    // Event type filters (support both single and multiple)
    if (event_type) params.append('event_type', event_type as string);
    if (event_types) {
      // Handle multiple event types
      const types = Array.isArray(event_types) ? event_types : [event_types];
      types.forEach(type => params.append('event_types', type as string));
    }
    
    // Boolean filters
    if (is_virtual !== undefined) params.append('is_virtual', is_virtual as string);
    if (exclude_full !== undefined) params.append('exclude_full', exclude_full as string);
    if (high_priority_only !== undefined) params.append('high_priority_only', high_priority_only as string);
    
    // Date/time filters
    if (timeslot_start_after) params.append('timeslot_start_after', timeslot_start_after as string);
    if (timeslot_start_before) params.append('timeslot_start_before', timeslot_start_before as string);
    if (timeslot_start) params.append('timeslot_start', timeslot_start as string);
    if (timeslot_end) params.append('timeslot_end', timeslot_end as string);
    
    // Tag filters (support multiple)
    if (tag_id) {
      const tags = Array.isArray(tag_id) ? tag_id : [tag_id];
      tags.forEach(tag => params.append('tag_id', tag as string));
    }
    
    // Approval status filters (support multiple)
    if (approval_status) {
      const statuses = Array.isArray(approval_status) ? approval_status : [approval_status];
      statuses.forEach(status => params.append('approval_status', status as string));
    }
    
    const queryString = params.toString();
    const baseUrl = 'https://api.mobilize.us/v1/events';
    const url = queryString ? `${baseUrl}?${queryString}` : baseUrl;
    
    console.log('Making request to:', url); // Debug log
    
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching civic events:', error);
    res.status(500).json({ error: 'Failed to fetch civic events' });
  }
});

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

// Civic Actions Routes
// Create a civic action submission
app.post('/api/civic-actions', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { title, description, eventType, location, eventDate, imageUrl } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const civicAction = await prisma.civicAction.create({
      data: {
        title,
        description,
        eventType,
        location,
        eventDate: eventDate ? new Date(eventDate) : null,
        userId,
        status: 'pending',
        imageUrl: imageUrl || null,
      },
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

    res.json(civicAction);
  } catch (error) {
    console.error('Create civic action error:', error);
    console.error('Request body:', { 
      title: req.body?.title, 
      description: req.body?.description?.substring(0, 100) + '...', 
      eventType: req.body?.eventType,
      location: req.body?.location,
      eventDate: req.body?.eventDate,
      imageUrlLength: req.body?.imageUrl?.length || 0
    });
    res.status(500).json({ error: 'Failed to create civic action' });
  }
});

// Get civic actions (admins see all, users see only approved/pinned)
app.get('/api/civic-actions', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let whereClause = {};
    
    // Admins see all civic actions
    if (user.role === 'ADMIN') {
      // Optionally filter by status
      const { status } = req.query;
      if (status) {
        whereClause = { status: String(status) };
      }
    } else {
      // Regular users only see approved actions
      whereClause = { status: 'approved' };
    }

    const civicActions = await prisma.civicAction.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        },
        reviewer: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    res.json(civicActions);
  } catch (error) {
    console.error('Get civic actions error:', error);
    res.status(500).json({ error: 'Failed to fetch civic actions' });
  }
});

// Get current user's civic actions (including pending) - visible only to the user
app.get('/api/civic-actions/mine', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;

    const civicActions = await prisma.civicAction.findMany({
      where: { userId },
      include: {
        reviewer: {
          select: { id: true, email: true, name: true }
        }
      },
      orderBy: [
        { status: 'asc' }, // pending first (alphabetically 'approved'>'pending'>'rejected'; to ensure pending first, we could map, but simple asc groups)
        { createdAt: 'desc' }
      ]
    });

    res.json(civicActions);
  } catch (error) {
    console.error('Get my civic actions error:', error);
    res.status(500).json({ error: 'Failed to fetch your civic actions' });
  }
});

// Update a civic action (owner-only) while status is pending
app.put('/api/civic-actions/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { title, description, eventType, location, eventDate, imageUrl } = req.body;

    // Fetch and ensure ownership and pending status
    const existing = await prisma.civicAction.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Civic action not found' });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    if (existing.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending actions can be edited' });
    }

    const updated = await prisma.civicAction.update({
      where: { id },
      data: {
        title: title ?? undefined,
        description: description ?? undefined,
        eventType: eventType ?? undefined,
        location: location ?? undefined,
        eventDate: eventDate ? new Date(eventDate) : undefined,
        imageUrl: imageUrl ?? undefined,
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Update civic action error:', error);
    res.status(500).json({ error: 'Failed to update civic action' });
  }
});

// Approve civic action (admin only)
app.post('/api/civic-actions/:id/approve', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { pinned } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const civicAction = await prisma.civicAction.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedBy: userId,
        reviewedAt: new Date(),
        isPinned: pinned || false,
      },
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

    res.json(civicAction);
  } catch (error) {
    console.error('Approve civic action error:', error);
    res.status(500).json({ error: 'Failed to approve civic action' });
  }
});

// Reject civic action (admin only)
app.post('/api/civic-actions/:id/reject', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { reason } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const civicAction = await prisma.civicAction.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy: userId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
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

    res.json(civicAction);
  } catch (error) {
    console.error('Reject civic action error:', error);
    res.status(500).json({ error: 'Failed to reject civic action' });
  }
});

// Toggle pin status (admin only)
app.post('/api/civic-actions/:id/toggle-pin', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const currentAction = await prisma.civicAction.findUnique({ where: { id } });
    if (!currentAction) {
      return res.status(404).json({ error: 'Civic action not found' });
    }

    const civicAction = await prisma.civicAction.update({
      where: { id },
      data: {
        isPinned: !currentAction.isPinned,
      }
    });

    res.json(civicAction);
  } catch (error) {
    console.error('Toggle pin error:', error);
    res.status(500).json({ error: 'Failed to toggle pin status' });
  }
});

// Mount all routes on /bridge as well (for nginx proxy)
const bridgeApp = express.Router();
bridgeApp.use(app._router);

// Create a new app that handles both root and /bridge prefix
const finalApp = express();
finalApp.use(cors({ 
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3000'
  ], 
  credentials: true 
}));

// Add redirect for /wizard/ to /bridge/wizard
finalApp.get('/wizard', (req, res) => {
  res.redirect(301, '/bridge/wizard');
});

finalApp.get('/wizard/', (req, res) => {
  res.redirect(301, '/bridge/wizard');
});

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
