import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const prisma = new PrismaClient();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Ghost webhook - must come BEFORE express.json() so we can verify signature on raw body
app.post(
  '/api/ghost/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const secret = process.env.GHOST_WEBHOOK_SECRET;
      const signatureHeader = req.header('X-Ghost-Signature') || '';
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

      // Optional signature verification if secret is configured
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

      // Parse JSON after signature verification
      let payload: any = {};
      try {
        const text = rawBody.toString('utf8');
        payload = text ? JSON.parse(text) : {};
      } catch (e) {
        console.warn('Ghost webhook JSON parse error');
      }

      // Minimal logging; do not block Ghost retries
      const evt = String(payload?.event || payload?.type || 'unknown');
      const ghostEntityId = payload?.post?.id || payload?.page?.id || payload?.member?.id || null;
      console.log('✅ Ghost webhook received', { event: evt, id: ghostEntityId });

      // Best-effort: persist Post changes and log sync (non-blocking)
      (async () => {
        try {
          // Resolve a user for relation. Prefer DEFAULT_USER_ID env, fallback to first or create one.
          let resolvedUserId = process.env.DEFAULT_USER_ID || null;
          if (resolvedUserId) {
            const exists = await prisma.user.findUnique({ where: { id: resolvedUserId } });
            if (!exists) resolvedUserId = null;
          }
          if (!resolvedUserId) {
            const first = await prisma.user.findFirst();
            resolvedUserId = first?.id || (await prisma.user.create({
              data: { email: `ghost-webhook@local-${Date.now()}` }
            })).id;
          }

          // Handle only post-related events for now
          const postPayload = payload?.post;
          if (postPayload && ghostEntityId) {
            const action = evt.toLowerCase();
            const isDelete = action.includes('deleted');
            const isUnpublish = action.includes('unpublished');

            if (isDelete) {
              // Remove by ghostId if exists, otherwise ignore
              const existing = await prisma.post.findUnique({ where: { ghostId: String(ghostEntityId) } });
              if (existing) {
                await prisma.post.delete({ where: { id: existing.id } });
              }
            } else {
              // Upsert post
              const title = postPayload.title || 'Untitled';
              const content = postPayload.html || postPayload.plaintext || '';
              const slug = postPayload.slug || undefined;
              const status = isUnpublish ? 'draft' : (postPayload.status || 'draft');
              const publishedAt = postPayload.published_at ? new Date(postPayload.published_at) : null;
              const ghostSlug = postPayload.slug || null;
              const ghostUrl = postPayload.url || null;

              await prisma.post.upsert({
                where: { ghostId: String(ghostEntityId) },
                update: {
                  title,
                  content,
                  slug: slug || (ghostSlug ? `${ghostSlug}` : undefined) || `ghost-${ghostEntityId}`,
                  status,
                  publishedAt: publishedAt || undefined,
                  ghostSlug: ghostSlug || undefined,
                  ghostUrl: ghostUrl || undefined,
                },
                create: {
                  title,
                  content,
                  slug: slug || (ghostSlug ? `${ghostSlug}` : `ghost-${ghostEntityId}`),
                  status,
                  publishedAt: publishedAt || undefined,
                  ghostId: String(ghostEntityId),
                  ghostSlug: ghostSlug || undefined,
                  ghostUrl: ghostUrl || undefined,
                  userId: resolvedUserId,
                }
              });
            }
          }

          await prisma.syncLog.create({
            data: {
              action: evt,
              status: 'success',
              source: 'ghost',
              target: 'atproto',
              ghostId: ghostEntityId || undefined,
              error: null,
              userId: resolvedUserId as string
            }
          });
        } catch (err) {
          try {
            await prisma.syncLog.create({
              data: {
                action: evt,
                status: 'error',
                source: 'ghost',
                target: 'atproto',
                ghostId: ghostEntityId || undefined,
                error: err instanceof Error ? err.message : 'unknown',
                userId: (await prisma.user.findFirst())?.id || (await prisma.user.create({
                  data: { email: `ghost-webhook@local-${Date.now()}` }
                })).id
              }
            });
          } catch (_) {
            // ignore
          }
        }
      })();

      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(200).json({ ok: true });
    }
  }
);

// Generic JSON body parser for the rest of the app
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Ghost ATProto Backend is running!' });
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Backend server running on http://localhost:${port}`);
});
