# Ghost ATProto Bridge - System Overview

## Purpose
Bridge system to sync Ghost blog posts to Bluesky/ATProto and bring comments back to Ghost.

## Architecture

### Components
1. **Backend** (`ghost-atproto-fullstack/backend/`)
   - Express server running on port 5000
   - PostgreSQL database via Prisma ORM
   - Managed by PM2 as `atproto-backend`

2. **Frontend** (`ghost-atproto-fullstack/frontend/`)
   - Next.js application
   - Managed by PM2 as `atproto-frontend`

3. **Ghost Shim** (installed in user's Ghost instance)
   - Webhook handler for comment bridging
   - Located at user's Ghost site

## Key Flows

### 1. Article Display
- **Route**: Frontend `/dashboard/articles` calls `api.getPosts()`
- **API**: `GET /api/auth/posts` (backend `src/routes/auth.ts:271`)
- **Function**: Returns posts from DATABASE for authenticated user (fast, no external API calls)
- **Authentication**: Uses JWT token to identify user
- **Important**:
  - Posts shown are from database only (NOT fetched from Ghost on page load)
  - Page loads immediately with cached data
  - Ghost sync happens separately (manual trigger or cron job)

### 2. Ghost Sync (Separate from Page Load)
- **Route**: `POST /api/ghost/sync` (backend `src/routes/ghost.ts`)
- **Function**: Fetches posts from Ghost Admin API and stores in database
- **Trigger**: Manual button or scheduled cron job (NOT on page load)
- **Important**: This is the ONLY place that calls `fetchGhostPosts()`

### 3. Post to Bluesky
- **Route**: `POST /api/atproto/publish`
- **Function**: Publishes Ghost article to Bluesky
- Posts include title, excerpt, and link back to Ghost
- Stores `atprotoUri` and `atprotoCid` in Post record

### 4. Comments Back to Ghost
- Bluesky comments/replies monitored via ATProto
- Comments sent to Ghost via shim webhook
- Creates Ghost member `comments@bsky.atproto.invalid` with label `bluesky-bridge`
- Comments associated with bridged member

## User Configuration (Per-User)

Each user stores in their profile:
- `ghostUrl`: Their Ghost site URL
- `ghostApiKey`: Admin API key (format: `id:secret`)
- `ghostContentApiKey`: Content API key
- `blueskyHandle`: Their Bluesky handle
- `blueskyPassword`: Bluesky password
- `shimUrl`: Ghost shim webhook URL
- `shimSecret`: Shared secret for shim authentication

**Important**: These are per-user settings, not global. Users see only their own Ghost articles.

## Database Models

### User
- Stores all per-user configuration
- Credentials encrypted/hashed

### Post
- `ghostId`: Unique ID from Ghost
- `slug`: Post slug (required)
- `title`, `content`: Post data
- `ghostUrl`: Canonical URL
- `atprotoUri`, `atprotoCid`: Bluesky reference
- `userId`: Belongs to specific user

### CommentMapping
- Maps Bluesky comments to Ghost comments
- Tracks sync status

## Key Files

### Backend
- `src/routes/auth.ts`: User profile & auth, includes `GET /api/auth/posts`
- `src/routes/ghost.ts`: Ghost sync operations
- `src/lib/ghost-admin.ts`: Ghost Admin API client functions
- `src/lib/atproto-client.ts`: Bluesky/ATProto operations

### Frontend
- `src/app/dashboard/articles/page.tsx`: Articles display
- `src/lib/api.ts`: API client
- `src/lib/types.ts`: TypeScript types

## Important Development Notes

### Build Commands
**ALWAYS use `--ignore-scripts`** when running npm commands:
```bash
npm install --ignore-scripts
npm run build --ignore-scripts
```
There's a problematic script in some package that should be avoided.

### Performance Architecture
**Critical**: Page loads must NOT trigger expensive operations:
- Article page shows database posts (fast)
- Ghost sync is manual/cron only (not on page load)
- Frontend shows loading state immediately, never blocks
- API timeouts set to 10 seconds max
- Comment sync currently DISABLED (needs schema fix)

### PM2 Management
```bash
pm2 restart atproto-backend
pm2 restart atproto-frontend
pm2 logs atproto-backend --lines 50
```

### Ghost Admin API
- Uses JWT tokens signed with Admin API key
- Token format: `Ghost ${jwt}`
- API Version: `v5.0`
- Token expires in 5 minutes (refresh as needed)

### Shim Status
The Ghost shim is already installed in the user's Ghost instance. It handles incoming webhook calls for comment synchronization.

## Current Status

### Working ✓
- Backend health endpoint
- User authentication (signup/login/JWT)
- User profile management (`/api/auth/me`)
- Article listing from DATABASE (`GET /api/auth/posts`)
  - Returns user's posts from database (fast, no Ghost API call)
  - Frontend displays empty state if no posts
  - Page loads immediately without blocking
- Frontend loads with proper loading states
- Database schema synced (shimUrl, shimSecret fields added)

### Fixed Issues ✓
- Removed Ghost API fetch from page load (was causing 504 timeouts)
- Frontend now shows immediate loading state (no blocking)
- Comment sync disabled temporarily (was causing Prisma errors)
- API timeout reduced to 10 seconds
- Ghost Admin API calls have 8 second timeout with proper error handling

### Not Yet Implemented
- Ghost sync button/endpoint (to populate database with Ghost posts)
- Post publishing to Bluesky
- Comment sync from Bluesky to Ghost
- Scheduled cron jobs for automatic sync

### Next Steps
1. Add manual "Sync from Ghost" button in UI
2. Test Ghost sync endpoint with real credentials
3. Test Bluesky publishing flow
4. Fix comment sync job (remove shim_secret query)
5. Re-enable comment sync once fixed
