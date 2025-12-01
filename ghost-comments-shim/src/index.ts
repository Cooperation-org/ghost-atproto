import express from 'express';
import { loadConfig } from './config';
import { createDbConnection } from './db';
import { createCommentsRouter } from './routes/comments';

async function main() {
  try {
    // Load configuration
    const config = loadConfig();
    console.log(`Starting Ghost Comments Shim on port ${config.port}...`);
    console.log(`Database type: ${config.ghostDbType}`);

    // Create database connection
    const db = createDbConnection(config);

    // Create Express app
    const app = express();

    // Middleware
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Comments endpoint
    app.use('/comments', createCommentsRouter(config, db));

    // Start server
    const server = app.listen(config.port, () => {
      console.log(`Ghost Comments Shim listening on port ${config.port}`);
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
