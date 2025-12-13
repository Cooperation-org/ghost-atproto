import cron from 'node-cron';
import { syncMobilizeEvents } from './sync-mobilize';
import { runCommentSync } from './sync-comments';

export function startScheduler() {
  console.log('📅 Starting job scheduler...');

  // Run Mobilize sync daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('🕐 Running scheduled Mobilize sync (2:00 AM)...');
    try {
      await syncMobilizeEvents();
    } catch (error) {
      console.error('❌ Scheduled Mobilize sync failed:', error);
    }
  });

  // DISABLED: Run comment sync every 15 minutes (testing manual sync first)
  // This fetches new Bluesky replies and syncs them to Ghost
  // TODO: Re-enable once manual sync is tested and working
  // cron.schedule('*/15 * * * *', async () => {
  //   console.log('🕐 Running scheduled comment sync...');
  //   try {
  //     await runCommentSync();
  //   } catch (error) {
  //     console.error('❌ Scheduled comment sync failed:', error);
  //   }
  // });

  console.log('✅ Scheduler started:');
  console.log('   - Mobilize sync: daily at 2:00 AM');
  console.log('   - Comment sync: DISABLED (testing manual sync first)');
}
