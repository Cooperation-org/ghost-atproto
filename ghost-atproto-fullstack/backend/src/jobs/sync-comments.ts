import { PrismaClient } from '@prisma/client';
import { syncCommentsForPost } from '../services/comment-sync';
import { ShimClient } from '../lib/shim-client';

const prisma = new PrismaClient();

/**
 * Sync Bluesky comments to Ghost for all users with configured shims
 * This job runs periodically to fetch new replies from Bluesky
 * and sync them to each user's Ghost instance via their configured shim.
 */
export async function runCommentSync(): Promise<{
  success: boolean;
  usersProcessed: number;
  postsProcessed: number;
  totalNewComments: number;
  totalErrors: number;
}> {
  console.log('🔄 Starting scheduled comment sync...');

  let usersProcessed = 0;
  let postsProcessed = 0;
  let totalNewComments = 0;
  let totalErrors = 0;

  try {
    // Get all users who have shim and Bluesky configured
    const users = await prisma.user.findMany({
      where: {
        shimUrl: { not: null },
        shimSecret: { not: null },
        blueskyHandle: { not: null },
        blueskyPassword: { not: null },
      },
      select: {
        id: true,
        email: true,
        shimUrl: true,
        shimSecret: true,
        blueskyHandle: true,
        blueskyPassword: true,
      },
    });

    if (users.length === 0) {
      console.log('⚠️ No users have shim configured, skipping sync');
      return { success: true, usersProcessed: 0, postsProcessed: 0, totalNewComments: 0, totalErrors: 0 };
    }

    console.log(`📋 Found ${users.length} users with shim configured`);

    for (const user of users) {
      try {
        const shimClient = new ShimClient({
          shimUrl: user.shimUrl!,
          sharedSecret: user.shimSecret!,
        });

        // Check shim health
        const healthy = await shimClient.healthCheck();
        if (!healthy) {
          console.log(`⚠️ Shim not healthy for user ${user.email}, skipping`);
          totalErrors++;
          continue;
        }

        // Get posts for this user that have been published to Bluesky
        const posts = await prisma.post.findMany({
          where: {
            userId: user.id,
            atprotoUri: { not: null },
            ghostId: { not: null },
          },
          select: { id: true, title: true },
        });

        for (const post of posts) {
          try {
            const result = await syncCommentsForPost(
              post.id,
              shimClient,
              user.blueskyHandle!,
              user.blueskyPassword!
            );
            postsProcessed++;
            totalNewComments += result.newComments;
            totalErrors += result.errors.length;
          } catch (err) {
            console.error(`Failed to sync post ${post.id}:`, err);
            totalErrors++;
          }
        }

        usersProcessed++;
      } catch (err) {
        console.error(`Failed to sync for user ${user.email}:`, err);
        totalErrors++;
      }
    }

    console.log(`✅ Comment sync completed:`);
    console.log(`   👤 Users processed: ${usersProcessed}`);
    console.log(`   📝 Posts processed: ${postsProcessed}`);
    console.log(`   💬 New comments synced: ${totalNewComments}`);
    if (totalErrors > 0) {
      console.log(`   ⚠️ Errors: ${totalErrors}`);
    }

    return {
      success: true,
      usersProcessed,
      postsProcessed,
      totalNewComments,
      totalErrors,
    };
  } catch (error) {
    console.error('❌ Comment sync failed:', error);
    return {
      success: false,
      usersProcessed,
      postsProcessed,
      totalNewComments,
      totalErrors: totalErrors + 1,
    };
  }
}
