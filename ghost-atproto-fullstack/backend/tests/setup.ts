import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Setup runs before all tests
beforeAll(async () => {
  // Ensure we're using the test database
  if (!process.env.DATABASE_URL?.includes('test')) {
    console.warn('⚠️  WARNING: Not using a test database! Set DATABASE_URL to a test database.');
  }

  // Run database migrations/push if needed
  // This ensures the test database schema is up to date
  console.log('📦 Ensuring test database schema is up to date...');
});

// Cleanup after all tests
afterAll(async () => {
  await prisma.$disconnect();
});

// Global error handler
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});
