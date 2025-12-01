import { AtpAgent, AppBskyFeedDefs, AppBskyFeedGetPostThread } from '@atproto/api';
import dotenv from 'dotenv';

dotenv.config();

export interface PostReply {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
  };
  record: {
    text: string;
    createdAt: string;
  };
  parent?: {
    uri: string;
  };
}

export interface PostThread {
  post: {
    uri: string;
    cid: string;
  };
  replies: PostReply[];
}

export async function publishToBluesky(content: string): Promise<{ uri: string; cid: string }> {
  const agent = new AtpAgent({ 
    service: process.env.BLUESKY_SERVICE_URL || 'https://bsky.social' 
  });
  
  const identifier = process.env.BLUESKY_IDENTIFIER ;
  const password = process.env.BLUESKY_APP_PASSWORD ;

  if (!identifier || !password) {
    throw new Error('Bluesky credentials not configured');
  }

  try {
    await agent.login({
      identifier,
      password
    });
    
    const response = await agent.post({
      text: content,
      createdAt: new Date().toISOString()
    });

    return {
      uri: response.uri,
      cid: response.cid
    };
  } catch (error) {
    console.error('Error publishing to Bluesky:', error);
    throw new Error(`Failed to publish to Bluesky: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch a post thread with all its replies from Bluesky
 */
export async function getPostThread(postUri: string, depth: number = 10): Promise<PostThread> {
  const agent = new AtpAgent({
    service: process.env.BLUESKY_SERVICE_URL || 'https://bsky.social'
  });

  try {
    const response = await agent.getPostThread({
      uri: postUri,
      depth,
    });

    if (!AppBskyFeedDefs.isThreadViewPost(response.data.thread)) {
      throw new Error('Invalid thread response');
    }

    const thread = response.data.thread;
    const replies: PostReply[] = [];

    // Helper function to recursively extract replies
    function extractReplies(threadNode: AppBskyFeedDefs.ThreadViewPost) {
      if (threadNode.replies) {
        for (const reply of threadNode.replies) {
          if (AppBskyFeedDefs.isThreadViewPost(reply)) {
            const replyPost = reply.post;

            // Extract text from record
            const record = replyPost.record as { text: string; createdAt: string; reply?: { parent: { uri: string } } };

            replies.push({
              uri: replyPost.uri,
              cid: replyPost.cid,
              author: {
                did: replyPost.author.did,
                handle: replyPost.author.handle,
                displayName: replyPost.author.displayName,
              },
              record: {
                text: record.text,
                createdAt: record.createdAt,
              },
              parent: record.reply?.parent,
            });

            // Recursively extract nested replies
            extractReplies(reply);
          }
        }
      }
    }

    extractReplies(thread);

    return {
      post: {
        uri: thread.post.uri,
        cid: thread.post.cid,
      },
      replies,
    };
  } catch (error) {
    console.error('Error fetching post thread:', error);
    throw new Error(`Failed to fetch post thread: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}