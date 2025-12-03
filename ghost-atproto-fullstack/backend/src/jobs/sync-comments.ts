import { syncAllComments } from '../services/comment-sync';
import { createShimClient } from '../lib/shim-client';

/**
 * Sync all Bluesky comments to Ghost
 * This job runs periodically to fetch new replies from Bluesky
 * and sync them to Ghost via the comments shim.
 */
export async function runCommentSync(): Promise<{
  success: boolean;
  postsProcessed: number;
  totalNewComments: number;
  totalErrors: number;
}> {
  console.log('🔄 Starting scheduled comment sync...');

  // Check if shim is configured
  if (!process.env.SHIM_URL || !process.env.SHIM_SHARED_SECRET) {
    console.log('⚠️ Comment sync skipped: SHIM_URL and SHIM_SHARED_SECRET not configured');
    return {
      success: false,
      postsProcessed: 0,
      totalNewComments: 0,
      totalErrors: 0,
    };
  }

  try {
    const shimClient = createShimClient();

    // Check shim health before syncing
    const shimHealthy = await shimClient.healthCheck();
    if (!shimHealthy) {
      console.error('❌ Comment sync failed: Shim is not healthy');
      return {
        success: false,
        postsProcessed: 0,
        totalNewComments: 0,
        totalErrors: 0,
      };
    }

    // Run the sync
    const results = await syncAllComments(shimClient);

    const totalNew = results.reduce((sum, r) => sum + r.newComments, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    console.log(`✅ Comment sync completed:`);
    console.log(`   📝 Posts processed: ${results.length}`);
    console.log(`   💬 New comments synced: ${totalNew}`);
    if (totalErrors > 0) {
      console.log(`   ⚠️ Errors: ${totalErrors}`);
    }

    return {
      success: true,
      postsProcessed: results.length,
      totalNewComments: totalNew,
      totalErrors,
    };
  } catch (error) {
    console.error('❌ Comment sync failed:', error);
    return {
      success: false,
      postsProcessed: 0,
      totalNewComments: 0,
      totalErrors: 1,
    };
  }
}
