import cron from 'node-cron';
import { syncMobilizeEvents } from './sync-mobilize';

export function startScheduler() {
  console.log('📅 Starting job scheduler...');

  // Run daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('🕐 Running scheduled Mobilize sync (2:00 AM)...');
    try {
      await syncMobilizeEvents();
    } catch (error) {
      console.error('❌ Scheduled sync failed:', error);
    }
  });

  console.log('✅ Scheduler started - Mobilize sync will run daily at 2:00 AM');
}
