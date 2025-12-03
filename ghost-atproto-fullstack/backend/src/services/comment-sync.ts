import { PrismaClient } from '@prisma/client';
import { getPostThread, PostReply } from '../lib/atproto';
import { ShimClient } from '../lib/shim-client';

const prisma = new PrismaClient();

export interface CommentSyncResult {
  postId: string;
  newComments: number;
  errors: string[];
}

/**
 * Sync comments for a specific post from Bluesky to Ghost
 */
export async function syncCommentsForPost(
  postId: string,
  shimClient: ShimClient
): Promise<CommentSyncResult> {
  const errors: string[] = [];
  let newComments = 0;

  try {
    // Get the post with its atproto URI
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { commentMappings: true },
    });

    if (!post) {
      throw new Error(`Post not found: ${postId}`);
    }

    if (!post.atprotoUri) {
      throw new Error(`Post has no atprotoUri: ${postId}`);
    }

    if (!post.ghostId) {
      throw new Error(`Post has no ghostId: ${postId}`);
    }

    // Fetch the thread from Bluesky
    const thread = await getPostThread(post.atprotoUri);

    // Create a map of existing synced comments
    const existingMappings = new Map(
      post.commentMappings.map((m) => [m.bskyReplyUri, m])
    );

    // Sort replies by createdAt to ensure parents are processed before children
    // This helps maintain proper parent-child relationships
    const sortedReplies = [...thread.replies].sort((a, b) => {
      return new Date(a.record.createdAt).getTime() - new Date(b.record.createdAt).getTime();
    });

    // Process each reply (sorted oldest first so parents come before children)
    for (const reply of sortedReplies) {
      try {
        // Skip if already synced
        if (existingMappings.has(reply.uri)) {
          continue;
        }

        // Determine parent comment ID (if this is a reply to another comment)
        let parentCommentId: string | null = null;
        if (reply.parent && reply.parent.uri !== post.atprotoUri) {
          const parentMapping = await prisma.commentMapping.findUnique({
            where: { bskyReplyUri: reply.parent.uri },
          });
          parentCommentId = parentMapping?.ghostCommentId || null;
        }

        // Build Bluesky URLs
        const bskyProfileUrl = `https://bsky.app/profile/${reply.author.handle}`;
        const replyPostId = reply.uri.split('/').pop() || '';
        const bskyPostUrl = `https://bsky.app/profile/${reply.author.handle}/post/${replyPostId}`;

        // Call shim to create the comment
        const result = await shimClient.createComment({
          post_id: post.ghostId,
          bsky_handle: reply.author.handle,
          bsky_profile_url: bskyProfileUrl,
          bsky_post_url: bskyPostUrl,
          comment_text: reply.record.text,
          parent_comment_id: parentCommentId,
          created_at: reply.record.createdAt,
        });

        // Store the mapping
        await prisma.commentMapping.create({
          data: {
            bskyReplyUri: reply.uri,
            ghostCommentId: result.comment_id,
            postId: post.id,
            bskyAuthorDid: reply.author.did,
            bskyAuthorHandle: reply.author.handle,
          },
        });

        newComments++;
      } catch (error) {
        const errorMsg = `Failed to sync reply ${reply.uri}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return {
      postId,
      newComments,
      errors,
    };
  } catch (error) {
    const errorMsg = `Failed to sync comments for post ${postId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(errorMsg);
    errors.push(errorMsg);

    return {
      postId,
      newComments,
      errors,
    };
  }
}

/**
 * Sync comments for all posts that have both ghostId and atprotoUri
 */
export async function syncAllComments(shimClient: ShimClient): Promise<CommentSyncResult[]> {
  try {
    // Get all posts with both ghostId and atprotoUri
    const posts = await prisma.post.findMany({
      where: {
        ghostId: { not: null },
        atprotoUri: { not: null },
      },
      select: { id: true },
    });

    const results: CommentSyncResult[] = [];

    for (const post of posts) {
      const result = await syncCommentsForPost(post.id, shimClient);
      results.push(result);
    }

    return results;
  } catch (error) {
    console.error('Failed to sync all comments:', error);
    throw error;
  }
}
