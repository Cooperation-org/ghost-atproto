/**
 * Clear existing posts and trigger a fresh sync with full content
 * Run this after updating the Ghost API content format parameters
 */

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

async function clearAndResync() {
  try {
    console.log('🗑️  Step 1: Clearing existing posts from database...');
    
    // Delete all posts and sync logs
    const deletedPosts = await prisma.post.deleteMany({});
    console.log(`   ✅ Deleted ${deletedPosts.count} posts`);
    
    const deletedLogs = await prisma.syncLog.deleteMany({});
    console.log(`   ✅ Deleted ${deletedLogs.count} sync logs`);
    
    console.log('\n🔄 Step 2: Finding your user account...');
    const user = await prisma.user.findFirst({
      where: {
        AND: [
          { ghostUrl: { not: null } },
          { ghostApiKey: { not: null } },
          { blueskyHandle: { not: null } },
          { blueskyPassword: { not: null } }
        ]
      }
    });
    
    if (!user) {
      console.error('❌ No configured user found. Please complete the wizard first.');
      process.exit(1);
    }
    
    console.log(`   ✅ Found user: ${user.email}`);
    console.log(`   📍 Ghost URL: ${user.ghostUrl}`);
    console.log(`   🦋 Bluesky: ${user.blueskyHandle}`);
    
    console.log('\n🚀 Step 3: Triggering fresh sync with full content...');
    console.log('   Please wait, this may take a few minutes...\n');
    
    // Make request to sync endpoint
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    
    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    
    try {
      const response = await axios.post(
        `${backendUrl}/api/auth/sync`,
        { 
          limit: 50,  // Sync up to 50 posts
          force: true // Force re-sync even if posts exist
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✨ Sync Complete!');
      console.log(`   📊 Synced: ${response.data.syncedCount} posts`);
      console.log(`   ⏭️  Skipped: ${response.data.skippedCount} posts`);
      console.log(`   📝 Total processed: ${response.data.totalProcessed} posts`);
      console.log('\n✅ All done! Your articles now have full content.');
      console.log('   Go to your dashboard to view them!\n');
      
    } catch (syncError) {
      if (syncError.response) {
        console.error('❌ Sync failed:', syncError.response.data);
      } else {
        console.error('❌ Sync failed:', syncError.message);
      }
      console.log('\n💡 Make sure your backend server is running:');
      console.log('   cd backend && npm run dev');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
clearAndResync();

