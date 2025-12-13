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

export interface BlueskyCredentials {
  handle: string;
  password: string;
}

export async function publishToBluesky(
  content: string,
  credentials?: BlueskyCredentials
): Promise<{ uri: string; cid: string }> {
  const agent = new AtpAgent({
    service: process.env.BLUESKY_SERVICE_URL || 'https://bsky.social'
  });

  // Use provided credentials or fall back to env vars
  const identifier = credentials?.handle || process.env.BLUESKY_IDENTIFIER;
  const password = credentials?.password || process.env.BLUESKY_APP_PASSWORD;

  if (!identifier || !password) {
    throw new Error('Bluesky credentials not configured. Please add your Bluesky handle and app password in Settings.');
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
 * DEPRECATED: Use getNotificationReplies() instead for better efficiency
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

/**
 * Get replies to user's posts via notifications API (more efficient than getPostThread)
 * Filters notifications for reply events to specific post URIs
 */
export async function getNotificationReplies(
  credentials: BlueskyCredentials,
  postUris: string[]
): Promise<PostReply[]> {
  const agent = new AtpAgent({
    service: process.env.BLUESKY_SERVICE_URL || 'https://bsky.social'
  });

  try {
    // Authenticate
    await agent.login({
      identifier: credentials.handle,
      password: credentials.password
    });

    // Fetch notifications
    const response = await agent.listNotifications({
      limit: 100, // Get last 100 notifications
    });

    const replies: PostReply[] = [];

    console.log(`📬 Fetched ${response.data.notifications.length} notifications`);
    const replyNotifications = response.data.notifications.filter(n => n.reason === 'reply');
    console.log(`💬 Found ${replyNotifications.length} reply notifications`);

    // Filter for reply notifications to our posts
    for (const notification of response.data.notifications) {
      // Only process reply notifications
      if (notification.reason !== 'reply') {
        continue;
      }

      // Check if this reply is to one of our tracked posts
      const record = notification.record as any;
      if (!record?.reply?.parent?.uri) {
        continue;
      }

      const parentUri = record.reply.parent.uri;
      console.log(`🔍 Checking reply to: ${parentUri}`);
      console.log(`🎯 Looking for: ${postUris.join(', ')}`);

      if (!postUris.includes(parentUri)) {
        continue;
      }

      console.log(`✅ Found matching reply from ${notification.author.handle}`);

      // Extract reply information
      replies.push({
        uri: notification.uri,
        cid: notification.cid,
        author: {
          did: notification.author.did,
          handle: notification.author.handle,
          displayName: notification.author.displayName,
        },
        record: {
          text: record.text || '',
          createdAt: record.createdAt || notification.indexedAt,
        },
        parent: {
          uri: parentUri,
        },
      });
    }

    return replies;
  } catch (error) {
    console.error('Error fetching notification replies:', error);
    throw new Error(`Failed to fetch notification replies: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}