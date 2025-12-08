/**
 * Main Server Entry Point
 *
 * File: backend/src/server.ts
 *
 * This file sets up Express, middleware, and mounts route modules.
 * Business logic lives in route files under src/routes/
 */

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';

// Load environment variables first
dotenv.config();

// Import route modules
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import civicActionsRoutes from './routes/civic-actions';
import atprotoRoutes from './routes/atproto';
import wizardRoutes from './routes/wizard';
import oauthRoutes from './routes/oauth';
import ghostRoutes from './routes/ghost';

// Import jobs
import { startScheduler } from './jobs/scheduler';

// Import OAuth setup
import { setupGoogleOAuth } from './lib/google-oauth';
import { setupBlueskyOAuth } from './lib/bluesky-oauth';
import { validateOAuthConfig } from './lib/oauth-config';

// =============================================================================
// App Setup
// =============================================================================

const app = express();
const port = process.env.PORT || 5000;
const prisma = new PrismaClient();

// =============================================================================
// Middleware
// =============================================================================

// Trust proxy for HTTPS behind nginx
app.set('trust proxy', true);

// CORS
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://bridge.linkedtrust.us',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.some((o) => origin.startsWith(o))) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(null, true); // Allow anyway for development
      }
    },
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
app.use(morgan('dev'));

// Session (for OAuth)
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// =============================================================================
// OAuth Setup
// =============================================================================

const oauthConfig = validateOAuthConfig();
console.log('[OAuth] Configuration:', oauthConfig);

if (oauthConfig.google.configured) {
  setupGoogleOAuth();
  console.log('[OAuth] Google OAuth configured');
}

if (oauthConfig.bluesky.configured) {
  setupBlueskyOAuth();
  console.log('[OAuth] Bluesky OAuth configured');
}

// =============================================================================
// Routes
// =============================================================================

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount route modules
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api', civicActionsRoutes); // Includes /public/civic-actions and /civic-actions
app.use('/api/atproto', atprotoRoutes);
app.use('/api/wizard', wizardRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/ghost', ghostRoutes);

// =============================================================================
// Error Handling
// =============================================================================

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
  });
});

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[Server] Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
);

// =============================================================================
// Server Start
// =============================================================================

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('[Database] Connected successfully');

    // Start scheduler
    startScheduler();
    console.log('[Scheduler] Started');

    // Start listening
    app.listen(port, () => {
      console.log(`[Server] Running on port ${port}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

export default app;
