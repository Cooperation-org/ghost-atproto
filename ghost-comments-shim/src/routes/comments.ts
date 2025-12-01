import { Request, Response, Router } from 'express';
import { Config } from '../config';
import { DbConnection, insertComment } from '../db';
import { generateGhostId, isValidGhostId } from '../utils/ghost-id';
import { buildCommentHtml } from '../utils/sanitize';

export interface CreateCommentRequest {
  post_id: string;
  bsky_handle: string;
  bsky_profile_url: string;
  bsky_post_url: string;
  comment_text: string;
  parent_comment_id: string | null;
  created_at: string;
}

function validateCreateCommentRequest(body: any): CreateCommentRequest {
  const errors: string[] = [];

  if (!body.post_id || typeof body.post_id !== 'string') {
    errors.push('post_id is required and must be a string');
  } else if (!isValidGhostId(body.post_id)) {
    errors.push('post_id must be a valid Ghost ID (24-char hex)');
  }

  if (!body.bsky_handle || typeof body.bsky_handle !== 'string') {
    errors.push('bsky_handle is required and must be a string');
  }

  if (!body.bsky_profile_url || typeof body.bsky_profile_url !== 'string') {
    errors.push('bsky_profile_url is required and must be a string');
  }

  if (!body.bsky_post_url || typeof body.bsky_post_url !== 'string') {
    errors.push('bsky_post_url is required and must be a string');
  }

  if (!body.comment_text || typeof body.comment_text !== 'string') {
    errors.push('comment_text is required and must be a string');
  }

  if (body.parent_comment_id !== null && body.parent_comment_id !== undefined) {
    if (typeof body.parent_comment_id !== 'string') {
      errors.push('parent_comment_id must be a string or null');
    } else if (!isValidGhostId(body.parent_comment_id)) {
      errors.push('parent_comment_id must be a valid Ghost ID (24-char hex)');
    }
  }

  if (!body.created_at || typeof body.created_at !== 'string') {
    errors.push('created_at is required and must be a string');
  }

  if (errors.length > 0) {
    throw new Error(errors.join(', '));
  }

  return {
    post_id: body.post_id,
    bsky_handle: body.bsky_handle,
    bsky_profile_url: body.bsky_profile_url,
    bsky_post_url: body.bsky_post_url,
    comment_text: body.comment_text,
    parent_comment_id: body.parent_comment_id || null,
    created_at: body.created_at,
  };
}

export function createCommentsRouter(config: Config, db: DbConnection): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
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

      // Validate request body
      let requestData: CreateCommentRequest;
      try {
        requestData = validateCreateCommentRequest(req.body);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }

      // Build comment HTML with sanitization
      const html = buildCommentHtml({
        bskyHandle: requestData.bsky_handle,
        bskyProfileUrl: requestData.bsky_profile_url,
        commentText: requestData.comment_text,
        bskyPostUrl: requestData.bsky_post_url,
      });

      // Generate comment ID
      const commentId = generateGhostId();

      // Format created_at for database
      const createdAt = new Date(requestData.created_at)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      // Insert into database
      await insertComment(db, {
        id: commentId,
        postId: requestData.post_id,
        memberId: config.blueskyMemberId,
        parentId: requestData.parent_comment_id,
        html,
        createdAt,
      });

      // Return success
      res.status(201).json({ comment_id: commentId });
    } catch (err) {
      console.error('Error creating comment:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
