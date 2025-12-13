#!/usr/bin/env node
import express from 'express';
import { loadConfig } from './config';
import { createDbConnection } from './db';
import { createCommentsRouter } from './routes/comments';
import { createTestRouter } from './routes/test';

async function main() {
  console.log('Ghost Comments Shim v0.1.0');
  console.log('==========================\n');

  try {
    // Load and validate configuration
    console.log('Loading configuration...');
    const config = loadConfig();
    console.log(`✓ Database type: ${config.ghostDbType}`);
    console.log(`✓ Bluesky member ID: ${config.blueskyMemberId}`);
    console.log(`✓ Port: ${config.port}`);

    // Create database connection
    console.log('\nConnecting to database...');
    const db = createDbConnection(config);
    console.log(`✓ Database connection established`);

    // Create Express app
    const app = express();

    // Middleware
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', version: '0.1.0' });
    });

    // Comments endpoint
    app.use('/comments', createCommentsRouter(config, db));

    // Test endpoint
    app.use('/test', createTestRouter(config, db));

    // Start server
    const server = app.listen(config.port, () => {
      console.log(`\n✓ Ghost Comments Shim listening on port ${config.port}`);
      console.log(`\nEndpoints:`);
      console.log(`  GET  /health      - Health check`);
      console.log(`  POST /comments    - Create comment from Bluesky`);
      console.log(`  GET  /test        - Test database connectivity`);
      console.log(`  POST /test/write  - Test comment write (requires auth)\n`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully...');
      server.close(async () => {
        await db.close();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully...');
      server.close(async () => {
        await db.close();
        process.exit(0);
      });
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
