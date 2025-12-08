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
import passport from 'passport';
import atprotoRoutes from './routes/atproto';
import wizardRoutes from './routes/wizard';
import oauthRoutes from './routes/oauth';
import ghostRoutes from './routes/ghost';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import civicActionsRoutes from './routes/civic-actions';
import axios from 'axios';
import { setupGoogleOAuth } from './lib/google-oauth';
import { setupBlueskyOAuth } from './lib/bluesky-oauth';
import { validateOAuthConfig } from './lib/oauth-config';
import { syncMobilizeEvents } from './jobs/sync-mobilize';
import { startScheduler } from './jobs/scheduler';
import { handleError, ApiError } from './lib/errors';
import { authenticateToken as authMiddleware, requireAdmin, AuthRequest } from './middleware/auth';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const prisma = new PrismaClient();

// OAuth Client setup (TODO: Initialize when needed)
let oauthClient: NodeOAuthClient | null = null;

// JWT Secret - required for authentication
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Trust proxy - required for x-forwarded-proto to work correctly behind nginx
// This allows Express to trust the X-Forwarded-* headers set by nginx
app.set('trust proxy', true);

// Middleware
app.use(morgan('dev'));

app.use(cors({
  origin: true, // Allow all origins
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

// Initialize Passport for OAuth
app.use(passport.initialize());
app.use(passport.session());

// Setup OAuth providers
setupGoogleOAuth();
setupBlueskyOAuth(); // Full AT Protocol OAuth following official docs

// Validate OAuth configuration
validateOAuthConfig();

// Serve static files (for client-metadata.json)
app.use(express.static(path.join(__dirname, '../public')));

// Auth middleware (legacy - routes gradually migrating to middleware/auth.ts)
function authenticateToken(req: any, res: any, next: any) {
  const token = req.cookies.token || req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as unknown as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Helper: Register webhook with Ghost
export async function registerGhostWebhook(ghostUrl: string, ghostApiKey: string, userId: string): Promise<string | null> {
  try {
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

    const webhookUrl = `${process.env.BACKEND_URL}/api/ghost/webhook`;
    
    // Check if webhook already exists
    const existingWebhooks = await axios.get(`${ghostUrl}/ghost/api/admin/webhooks/`, {
      headers: {
        'Authorization': `Ghost ${token}`,
        'Accept-Version': 'v6.4'
      }
    });

    // Look for existing webhook with our URL
    const existingWebhook = existingWebhooks.data.webhooks?.find((webhook: any) => 
      webhook.target_url === webhookUrl && 
      webhook.event === 'post.published'
    );

    if (existingWebhook) {
      console.log(`✅ Webhook already exists: ${existingWebhook.id}`);
      return existingWebhook.id;
    }

    // Create new webhook
    const webhookData = {
      webhook: {
        event: 'post.published',
        target_url: webhookUrl,
        name: 'Bluesky Publisher',
        secret: process.env.GHOST_WEBHOOK_SECRET || '',
        integration_id: null
      }
    };

    const response = await axios.post(`${ghostUrl}/ghost/api/admin/webhooks/`, webhookData, {
      headers: {
        'Authorization': `Ghost ${token}`,
        'Accept-Version': 'v6.4',
        'Content-Type': 'application/json'
      }
    });

    const webhookId = response.data.webhooks?.[0]?.id;
    console.log(`✅ Webhook registered: ${webhookId}`);
    return webhookId;

  } catch (error) {
    console.error('Failed to register Ghost webhook:', error);
    return null;
  }
}

// Helper: Validate Ghost connection
export async function validateGhostConnection(ghostUrl: string, ghostApiKey: string): Promise<boolean> {
  try {
    const [keyId, keySecret] = ghostApiKey.split(':');
    if (!keyId || !keySecret) {
      return false;
    }

    // Create JWT token for Ghost Admin API
    const token = jwt.sign({}, Buffer.from(keySecret, 'hex'), {
      keyid: keyId,
      algorithm: 'HS256',
      expiresIn: '5m',
      audience: `/admin/`
    });

    // Test connection by fetching site info
    const response = await axios.get(`${ghostUrl}/ghost/api/admin/site/`, {
      headers: {
        'Authorization': `Ghost ${token}`,
        'Accept-Version': 'v6.4'
      }
    });

    return response.status === 200;
  } catch (error) {
    console.error('Ghost connection validation failed:', error);
    return false;
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
    const session = user.oauthSessions[0] as any; // Type assertion for OAuthSession with expiresAt
    try {
      // Check if token is expired (expiresAt should exist on OAuthSession)
      if (session.expiresAt && new Date(session.expiresAt) > new Date()) {
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

// Helper: Sync Ghost posts locally (without Bluesky requirement)
async function syncGhostPostsLocally(
  userId: string,
  ghostUrl: string,
  ghostApiKey: string,
  limit: number = 50,
  force: boolean = false
) {
  try {
    console.log(`\n🔄 Starting local sync for ${ghostUrl} (user: ${userId})...`);

    // Fetch Ghost posts using Admin API
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
        'Accept-Version': 'v6.4'
      },
      params: {
        limit,
        filter: 'status:published',
        order: 'published_at DESC',
        fields: 'id,title,slug,excerpt,custom_excerpt,html,plaintext,mobiledoc,lexical,feature_image,url,published_at',
        formats: 'html,plaintext,mobiledoc'
      }
    });

    const posts = response.data.posts || [];
    console.log(`📖 Found ${posts.length} posts`);

    let syncedCount = 0;
    let skippedCount = 0;

    // Process each post
    for (const post of posts) {
      try {
        const ghostId = String(post.id);
        const title = post.title || 'Untitled';
        const content = post.html || post.plaintext || '';
        const excerpt = post.excerpt || post.custom_excerpt || '';
        const featureImage = post.feature_image || null;
        const slug = post.slug || `ghost-${ghostId}`;
        const ghostSlug = post.slug || null;
        const ghostUrl = post.url || null;
        const publishedAt = post.published_at ? new Date(post.published_at) : new Date();

        // Check if post already exists (unless force is true)
        if (!force) {
          const existingPost = await prisma.post.findUnique({
            where: { ghostId }
          });
          
          if (existingPost) {
            console.log(`⏭️  Skipping existing post: ${title}`);
            skippedCount++;
            continue;
          }
        }

        // Upsert post in database
        const dbPost = await prisma.post.upsert({
          where: { ghostId },
          update: {
            title,
            content,
            excerpt,
            featureImage,
            slug,
            status: 'published',
            publishedAt,
            ghostSlug: ghostSlug || undefined,
            ghostUrl: ghostUrl || undefined,
          },
          create: {
            title,
            content,
            excerpt,
            featureImage,
            slug,
            status: 'published',
            publishedAt,
            ghostId,
            ghostSlug: ghostSlug || undefined,
            ghostUrl: ghostUrl || undefined,
            userId: userId,
          }
        });

        // Create sync log for local storage
        await prisma.syncLog.create({
          data: {
            action: 'store',
            status: 'success',
            source: 'ghost',
            target: 'local',
            ghostId,
            postId: dbPost.id,
            userId: userId
          }
        });

        console.log(`✅ Stored locally: ${title}`);
        syncedCount++;

      } catch (error) {
        console.error(`❌ Failed to process post ${post.id}:`, error);
        await prisma.syncLog.create({
          data: {
            action: 'store',
            status: 'error',
            source: 'ghost',
            target: 'local',
            ghostId: String(post.id),
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: userId
          }
        });
      }
    }

    console.log(`\n📊 Local sync completed:`);
    console.log(`   ✅ Synced: ${syncedCount} posts`);
    console.log(`   ⏭️  Skipped: ${skippedCount} posts`);

    return {
      synced: syncedCount,
      skipped: skippedCount,
      total: posts.length
    };

  } catch (error) {
    console.error('❌ Local sync failed:', error);
    throw error;
  }
}

// Helper: Sync Ghost posts to Bluesky (optional)
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
        'Accept-Version': 'v6.4'
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

          // Check if user has valid Ghost configuration
          if (!user.ghostUrl || !user.ghostApiKey || 
              user.ghostUrl === 'SKIPPED' || user.ghostApiKey === 'SKIPPED' ||
              user.ghostUrl.trim() === '' || user.ghostApiKey.trim() === '') {
            console.log(`User ${userId} has no valid Ghost configuration, skipping webhook processing`);
            return;
          }

          // Note: Bluesky configuration is optional for webhook processing
          // Posts will be stored locally regardless of Bluesky connection

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

              // Post to Bluesky (optional - only if user has connected their account)
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
                console.log('📝 Post stored locally (Bluesky not connected)');
                
                // Create a sync log for local storage
                await prisma.syncLog.create({
                  data: {
                    action: 'store',
                    status: 'success',
                    source: 'ghost',
                    target: 'local',
                    ghostId: ghostEntityId,
                    postId: post.id,
                    userId: userId
                  }
                });
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


// Mount route modules
app.use('/api/atproto', atprotoRoutes);
app.use('/api/wizard', wizardRoutes);
app.use('/api/auth', oauthRoutes);  // OAuth routes (Google, Bluesky callbacks)
app.use('/api/auth', authRoutes);   // Auth routes (login, signup, me) - overrides overlap
app.use('/api/users', usersRoutes); // User admin routes
app.use('/api', civicActionsRoutes); // Civic actions (/public/civic-actions, /civic-actions)
app.use('/api/ghost', ghostRoutes);


app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Ghost ATProto Backend is running!' });
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

// Manual sync endpoint - sync Ghost posts locally and optionally to Bluesky
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
        blueskyPassword: true,
        autoSync: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate Ghost configuration
    if (!user.ghostUrl || !user.ghostApiKey || 
        user.ghostUrl === 'SKIPPED' || user.ghostApiKey === 'SKIPPED' ||
        user.ghostUrl.trim() === '' || user.ghostApiKey.trim() === '') {
      return res.status(400).json({ 
        error: 'Ghost Admin API key and URL are required for syncing. Please configure them in your settings.' 
      });
    }

    // Note: Bluesky configuration is optional for manual sync
    // Posts will be stored locally regardless of Bluesky connection

    // Validate Ghost connection before attempting sync
    const isValidConnection = await validateGhostConnection(user.ghostUrl, user.ghostApiKey);
    if (!isValidConnection) {
      return res.status(400).json({ 
        error: 'Invalid Ghost URL or API key. Please check your Ghost configuration.' 
      });
    }

    // First, sync posts locally (always works)
    const localResult = await syncGhostPostsLocally(
      userId,
      user.ghostUrl,
      user.ghostApiKey,
      limit || 50,
      force || false
    );

    let blueskyResult = null;
    
    // If user has Bluesky credentials, also sync to Bluesky
    if (user.blueskyHandle && user.blueskyPassword &&
        user.blueskyHandle !== 'SKIPPED' && user.blueskyPassword !== 'SKIPPED' &&
        user.blueskyHandle.trim() !== '' && user.blueskyPassword.trim() !== '') {
      try {
        console.log('🦋 Also syncing to Bluesky...');
        blueskyResult = await syncGhostToBluesky(
          userId,
          user.ghostUrl,
          user.ghostApiKey,
          user.blueskyHandle,
          user.blueskyPassword,
          limit || 50,
          force || false
        );
      } catch (error) {
        console.error('Bluesky sync failed, but local sync succeeded:', error);
        blueskyResult = { error: error instanceof Error ? error.message : 'Unknown error' };
      }
    } else {
      console.log('📝 Bluesky not configured, skipping Bluesky sync');
    }

    res.json({
      message: 'Sync completed successfully',
      local: localResult,
      bluesky: blueskyResult,
      summary: {
        localSynced: localResult.synced,
        localSkipped: localResult.skipped,
        blueskySynced: blueskyResult?.syncedCount || 0,
        blueskySkipped: blueskyResult?.skippedCount || 0,
        blueskyError: (blueskyResult as any)?.error || null
      }
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

// Posts Routes
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            // Don't expose email publicly
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
            name: true,
            blueskyHandle: true,
            // Don't expose email publicly
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

    // Default: only show upcoming events if no date filters provided
    if (!timeslot_start_after && !timeslot_start_before && !timeslot_start && !timeslot_end) {
      const now = new Date().toISOString();
      params.append('timeslot_start', `gte_${now}`);
    }

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

app.get('/api/sync-logs', authenticateToken, async (req: any, res) => {
  try {
    // Users can only see their own logs, admins can see all
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const isAdmin = user?.role === 'ADMIN';

    const logs = await prisma.syncLog.findMany({
      where: isAdmin ? undefined : { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

// User Engagement Routes

// Get user's impact dashboard data
app.get('/api/user/impact', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;

    // Get user's engagements with civic actions
    const engagements = await prisma.userEngagement.findMany({
      where: { userId },
      include: {
        civicAction: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Separate active commitments (interested/going) from completed
    const activeCommitments = engagements.filter(e =>
      e.status === 'interested' || e.status === 'going'
    );
    const completedActions = engagements.filter(e =>
      e.status === 'completed'
    );

    // Get user's created civic actions
    const createdActions = await prisma.civicAction.findMany({
      where: {
        userId,
        source: 'user_submitted' // Only user-submitted, not Mobilize sync
      },
      include: {
        engagements: true,
        reviewer: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get user's created articles
    const createdArticles = await prisma.post.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Calculate metrics
    const metrics = {
      completedActionsCount: completedActions.length,
      activeCommitmentsCount: activeCommitments.length,
      createdActionsCount: createdActions.length,
      createdArticlesCount: createdArticles.length,
    };

    res.json({
      metrics,
      activeCommitments: activeCommitments.map(e => ({
        id: e.id,
        status: e.status,
        notes: e.notes,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        civicAction: e.civicAction
      })),
      completedActions: completedActions.map(e => ({
        id: e.id,
        status: e.status,
        notes: e.notes,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        civicAction: e.civicAction
      })),
      createdActions: createdActions.map(action => ({
        ...action,
        engagementCount: action.engagements.length
      })),
      createdArticles
    });
  } catch (error) {
    console.error('Get user impact error:', error);
    res.status(500).json({ error: 'Failed to fetch user impact data' });
  }
});

// Create a new engagement
app.post('/api/user/engagements', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { civicActionId, status, notes } = req.body;

    if (!civicActionId) {
      return res.status(400).json({ error: 'civicActionId is required' });
    }

    // Validate status
    const validStatuses = ['interested', 'going', 'completed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: interested, going, completed' });
    }

    // Check if engagement already exists
    const existing = await prisma.userEngagement.findUnique({
      where: {
        userId_civicActionId: {
          userId,
          civicActionId
        }
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Engagement already exists. Use PATCH to update.' });
    }

    // Create engagement
    const engagement = await prisma.userEngagement.create({
      data: {
        userId,
        civicActionId,
        status: status || 'interested',
        notes: notes || null
      },
      include: {
        civicAction: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      }
    });

    res.json(engagement);
  } catch (error) {
    console.error('Create engagement error:', error);
    res.status(500).json({ error: 'Failed to create engagement' });
  }
});

// Update an engagement
app.patch('/api/user/engagements/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { status, notes } = req.body;

    // Check if engagement exists and belongs to user
    const existing = await prisma.userEngagement.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Engagement not found' });
    }

    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate status if provided
    if (status) {
      const validStatuses = ['interested', 'going', 'completed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be one of: interested, going, completed' });
      }
    }

    // Update engagement
    const engagement = await prisma.userEngagement.update({
      where: { id },
      data: {
        status: status ?? undefined,
        notes: notes !== undefined ? notes : undefined
      },
      include: {
        civicAction: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      }
    });

    res.json(engagement);
  } catch (error) {
    console.error('Update engagement error:', error);
    res.status(500).json({ error: 'Failed to update engagement' });
  }
});

// Delete an engagement
app.delete('/api/user/engagements/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    // Check if engagement exists and belongs to user
    const existing = await prisma.userEngagement.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Engagement not found' });
    }

    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete engagement
    await prisma.userEngagement.delete({
      where: { id }
    });

    res.json({ message: 'Engagement deleted successfully' });
  } catch (error) {
    console.error('Delete engagement error:', error);
    res.status(500).json({ error: 'Failed to delete engagement' });
  }
});

// Manual Mobilize sync trigger (admin only)
app.post('/api/admin/sync-mobilize', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { organizationIds, updatedSince } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔄 Manual Mobilize sync triggered by admin:', user.email);

    const result = await syncMobilizeEvents(
      organizationIds || [93],
      updatedSince
    );

    res.json({
      message: 'Mobilize sync completed',
      result
    });
  } catch (error) {
    console.error('Manual Mobilize sync error:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Mount all routes on /bridge as well (for nginx proxy)
const bridgeApp = express.Router();
bridgeApp.use(app._router);

// Create a new app that handles both root and /bridge prefix
const finalApp = express();
finalApp.use(cors({
  origin: true, // Allow all origins
  credentials: true
}));

// Add redirect for /wizard/ to /bridge/wizard (only for production server)
// In development, we want /wizard to work directly
if (process.env.NODE_ENV === 'production') {
  finalApp.get('/wizard', (req, res) => {
    res.redirect(301, '/bridge/wizard');
  });

  finalApp.get('/wizard/', (req, res) => {
    res.redirect(301, '/bridge/wizard');
  });
}

finalApp.use('/bridge', app);
finalApp.use('/', app);

// Start server
finalApp.listen(port, () => {
  console.log(`🚀 Backend server running on http://localhost:${port}`);
  console.log(`📝 Available at both:`);
  console.log(`   - http://localhost:${port}/api/health`);
  console.log(`   - http://localhost:${port}/bridge/api/health`);
  console.log(`🔐 Configure Ghost webhook with X-User-ID header`);

  // Start scheduled jobs
  startScheduler();
});
