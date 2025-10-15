/**
 * Create Test Post Script
 * 
 * This script creates a test post in the database for testing the dashboard.
 * Run with: node create-test-post.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createTestPost() {
  try {
    console.log('\n=== Create Test Post ===\n');

    // Find or create a test user
    let user = await prisma.user.findFirst();
    
    if (!user) {
      console.log('No users found. Creating a test user...');
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('testpass123', 10);
      
      user = await prisma.user.create({
        data: {
          email: 'testauthor@example.com',
          name: 'Test Author',
          password: hashedPassword,
          role: 'AUTHOR',
          blueskyHandle: 'testauthor.bsky.social',
        }
      });
      console.log('✅ Test user created:', user.email);
    } else {
      console.log('Using existing user:', user.email);
    }

    // Create a test post
    const post = await prisma.post.create({
      data: {
        title: 'Welcome to Ghost-Bluesky Bridge',
        content: '<p>This is a test article synced from Ghost to Bluesky. It demonstrates how articles from different authors appear in the dashboard.</p><p>Authors can write articles in Ghost CMS and automatically sync them to Bluesky for wider reach.</p>',
        excerpt: 'This is a test article synced from Ghost to Bluesky.',
        slug: 'welcome-to-ghost-bluesky-bridge',
        status: 'published',
        ghostUrl: 'https://example.com/blog/welcome',
        atprotoUri: 'at://did:plc:test123/app.bsky.feed.post/test456',
        atprotoCid: 'bafyreitest123456789',
        publishedAt: new Date(),
        userId: user.id,
      }
    });

    console.log('\n✅ Test post created successfully!');
    console.log('Title:', post.title);
    console.log('Author:', user.name);
    console.log('Status:', post.status);
    console.log('Synced to Bluesky:', post.atprotoUri ? 'Yes' : 'No');
    console.log('\nYou can now view this post in the dashboard at /dashboard/posts\n');

  } catch (error) {
    console.error('\n❌ Error creating test post:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestPost();

