import { Request, Response, Router } from 'express';
import { Config } from '../config';
import { DbConnection, insertComment } from '../db';
import { generateGhostId } from '../utils/ghost-id';

export function createTestRouter(config: Config, db: DbConnection): Router {
  const router = Router();

  // GET /test - Run database connectivity tests
  router.get('/', async (req: Request, res: Response) => {
    const results: {
      database: { status: string; message?: string };
      posts: { status: string; count?: number; sample?: any; message?: string };
      members: { status: string; blueskyMemberExists?: boolean; message?: string };
      writeTest?: { status: string; message?: string };
    } = {
      database: { status: 'pending' },
      posts: { status: 'pending' },
      members: { status: 'pending' },
    };

    try {
      // Test 1: Basic database connectivity
      try {
        await db.query('SELECT 1 as test');
        results.database = { status: 'ok' };
      } catch (err) {
        results.database = { status: 'error', message: (err as Error).message };
        res.status(500).json(results);
        return;
      }

      // Test 2: Query posts table
      try {
        const posts = await db.query(
          'SELECT id, slug, title FROM posts WHERE type = ? ORDER BY created_at DESC LIMIT 5',
          ['post']
        );
        results.posts = {
          status: 'ok',
          count: posts.length,
          sample: posts.map((p: any) => ({ id: p.id, slug: p.slug, title: p.title?.substring(0, 50) })),
        };
      } catch (err) {
        results.posts = { status: 'error', message: (err as Error).message };
      }

      // Test 3: Check if Bluesky member exists
      try {
        const members = await db.query(
          'SELECT id, name, email FROM members WHERE id = ?',
          [config.blueskyMemberId]
        );
        results.members = {
          status: 'ok',
          blueskyMemberExists: members.length > 0,
          message: members.length > 0
            ? `Found member: ${members[0].name} (${members[0].email})`
            : `Member ${config.blueskyMemberId} not found - create it in Ghost Admin`,
        };
      } catch (err) {
        results.members = { status: 'error', message: (err as Error).message };
      }

      res.json(results);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // POST /test/write - Test writing a comment (requires post_id)
  router.post('/write', async (req: Request, res: Response) => {
    try {
      // Validate authorization
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid authorization header' });
        return;
      }

      const token = authHeader.substring(7);
      if (token !== config.bridgeSharedSecret) {
        res.status(401).json({ error: 'Invalid authorization token' });
        return;
      }

      const { post_id } = req.body;
      if (!post_id) {
        res.status(400).json({ error: 'post_id is required' });
        return;
      }

      // Check if post exists
      const posts = await db.query('SELECT id, slug, title FROM posts WHERE id = ?', [post_id]);
      if (posts.length === 0) {
        res.status(404).json({
          error: 'Post not found',
          message: `No post with id ${post_id} exists in the database`,
        });
        return;
      }

      // Generate test comment
      const commentId = generateGhostId();
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const testHtml = '<p><strong>[TEST]</strong> This is a test comment from the shim. It will be deleted.</p>';

      // Insert test comment
      await insertComment(db, {
        id: commentId,
        postId: post_id,
        memberId: config.blueskyMemberId,
        parentId: null,
        html: testHtml,
        createdAt: now,
      });

      // Delete test comment immediately
      await db.execute('DELETE FROM comments WHERE id = ?', [commentId]);

      res.json({
        status: 'ok',
        message: 'Successfully wrote and deleted test comment',
        post: { id: posts[0].id, slug: posts[0].slug, title: posts[0].title },
      });
    } catch (err) {
      const error = err as Error & { code?: string; sqlMessage?: string };
      res.status(500).json({
        error: 'Write test failed',
        code: error.code,
        message: error.sqlMessage || error.message,
      });
    }
  });

  return router;
}
