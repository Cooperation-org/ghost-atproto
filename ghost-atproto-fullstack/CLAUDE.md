# Ghost to AT Protocol Bridge - Developer Documentation

## Project Overview

This is a multi-tenant service that bridges Ghost CMS blogs to Bluesky (AT Protocol). Each Ghost admin can connect their own Ghost blog and Bluesky account, and posts will automatically be published to Bluesky when published in Ghost.

## Architecture

### Components

1. **Backend (Node.js + Express + Prisma)**
   - Port: 5000
   - Database: MySQL (`ghost_atproto` database)
   - Authentication: Hybrid (OAuth + App Passwords)
   - Communication: REST API + Webhooks

2. **Frontend (Next.js + React)** - Coming Soon
   - Port: 3000
   - UI for managing Ghost/Bluesky connections

3. **Nginx Reverse Proxy**
   - Exposes backend at `/bridge` path
   - Handles SSL termination

### Data Flow

```
Ghost Blog (Any URL)
    │
    │ Webhook: POST /bridge/api/ghost/webhook
    │ Headers: X-User-ID, X-Ghost-Signature
    │
    ▼
Nginx (/bridge) ──> Backend (localhost:5000)
                         │
                         ├──> MySQL (ghost_atproto DB)
                         │    - Users table
                         │    - Posts table
                         │    - OAuthSession table
                         │    - SyncLog table
                         │
                         └──> Bluesky API
                              - Login with app password
                              - Post creation
```

## Database Schema

### User Model
- Multi-tenant: Each user represents a Ghost admin
- Stores Ghost credentials (URL, API key)
- Stores Bluesky credentials (handle, app password)
- Optional OAuth sessions for future OAuth flow

### Post Model
- Tracks posts synced from Ghost
- Maps Ghost post ID to Bluesky post URI
- Stores sync status

### OAuthSession Model (Future)
- For OAuth-based authentication
- Stores refresh/access tokens
- DPoP key for token binding

### SyncLog Model
- Audit trail of all sync operations
- Error tracking
- Retry logic support

## API Endpoints

### Health Check
```
GET /api/health
Response: { status: 'OK', message: '...' }
```

### User Management

**List Users**
```
GET /api/users
Response: [{ id, email, name, atprotoHandle, ghostUrl, ... }]
```

**Create User**
```
POST /api/users
Body: {
  email: "admin@example.com",
  name: "Admin Name",
  atprotoHandle: "user.bsky.social",
  atprotoAppPassword: "xxxx-xxxx-xxxx-xxxx",
  ghostUrl: "https://blog.example.com",
  ghostApiKey: "ghost_admin_api_key"
}
```

**Get User**
```
GET /api/users/:id
Response: { id, email, ..., oauthSessions: [...] }
```

**Update User**
```
PUT /api/users/:id
Body: {
  name?: "New Name",
  atprotoHandle?: "user.bsky.social",
  atprotoAppPassword?: "new-password",
  ghostUrl?: "https://newblog.com",
  ghostApiKey?: "new-api-key"
}
```

### Posts & Sync

**List Posts**
```
GET /api/posts
Response: [{ id, title, content, ghostId, atprotoUri, user: {...}, ... }]
```

**Sync Logs**
```
GET /api/sync-logs?userId=xxx
Response: [{ id, action, status, source, target, error, ... }]
```

### Webhooks

**Ghost Webhook Handler**
```
POST /api/ghost/webhook
Headers:
  X-Ghost-Signature: sha256=...
  X-User-ID: user-id-here
  Content-Type: application/json

Body: Ghost webhook payload (post.published event)
```

## Hybrid Authentication Strategy

### App Password (Current - Working)
1. User generates app password in Bluesky settings
2. User adds to their account in the service
3. Service uses BskyAgent.login() for each request
4. Simple, works immediately

### OAuth (Future - Planned)
1. User initiates OAuth flow
2. Service exchanges code for tokens
3. Tokens stored in OAuthSession table
4. Service uses DPoP for token binding
5. Tokens refresh automatically

**Fallback Logic:**
```javascript
async function getAgentForUser(userId) {
  // Try OAuth first
  if (hasValidOAuthSession) {
    return agentFromOAuth();
  }

  // Fallback to app password
  if (hasAppPassword) {
    return agentFromAppPassword();
  }

  return null;
}
```

## Ghost Integration Setup

### Step 1: Create Custom Integration in Ghost

1. Navigate to Ghost Admin → Settings → Integrations
2. Click "Add custom integration"
3. Name: "Bluesky Bridge"
4. Copy the Admin API Key

### Step 2: Create User in Bridge Service

```bash
curl -X POST http://your-domain.com/bridge/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@myblog.com",
    "name": "My Blog Admin",
    "atprotoHandle": "myblog.bsky.social",
    "atprotoAppPassword": "xxxx-xxxx-xxxx-xxxx",
    "ghostUrl": "https://myblog.com",
    "ghostApiKey": "ghost_admin_api_key_here"
  }'
```

Save the returned `user.id` value.

### Step 3: Add Webhook in Ghost

1. In the same Ghost integration, scroll to "Webhooks"
2. Click "Add webhook"
3. Configure:
   - **Name**: Post Published to Bluesky
   - **Event**: Post published
   - **Target URL**: `https://your-domain.com/bridge/api/ghost/webhook`
4. Add custom header:
   - **Key**: `X-User-ID`
   - **Value**: `user-id-from-step-2`

### Step 4: Test

Publish a post in Ghost and check:
- Sync logs: `GET /bridge/api/sync-logs`
- Posts: `GET /bridge/api/posts`
- Bluesky timeline

## Deployment

### Development

```bash
cd backend
make dev
```

### Production with PM2

```bash
# Install PM2
npm install -g pm2

# Start backend
cd backend
pm2 start npm --name "ghost-bridge" -- start

# Save PM2 config
pm2 save
pm2 startup
```

### Nginx Configuration

Add to your existing nginx site config (inside `server` block):

```nginx
location /bridge {
    rewrite ^/bridge(.*)$ $1 break;
    proxy_pass http://localhost:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Reload nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 5000 | Backend server port |
| `BASE_URL` | Yes | - | Public URL (e.g., `https://example.com/bridge`) |
| `FRONTEND_URL` | No | http://localhost:3000 | Frontend URL for CORS |
| `DATABASE_URL` | Yes | - | MySQL connection string |
| `GHOST_WEBHOOK_SECRET` | No | - | Optional webhook signature verification |
| `ATPROTO_SERVICE` | No | https://bsky.social | AT Protocol service URL |
| `OAUTH_CLIENT_ID` | No | - | OAuth client ID (future) |
| `OAUTH_REDIRECT_URI` | No | - | OAuth callback URL (future) |
| `DEFAULT_USER_ID` | No | - | Fallback user ID if X-User-ID header missing |

## Common Issues

### 1. Webhook Returns 401
**Cause:** Ghost signature verification failed
**Solution:** Either remove `GHOST_WEBHOOK_SECRET` from .env or set it to match Ghost webhook secret

### 2. "No user found to process webhook"
**Cause:** Missing `X-User-ID` header
**Solution:** Add custom header in Ghost webhook configuration

### 3. "App password login failed"
**Cause:** Invalid Bluesky credentials
**Solution:**
- Verify handle is correct (e.g., `user.bsky.social`)
- Regenerate app password in Bluesky settings
- Update user with new credentials

### 4. Database connection error
**Cause:** Wrong MySQL credentials
**Solution:** Verify `DATABASE_URL` in .env matches database setup

### 5. TypeScript compilation errors
**Cause:** Prisma client not generated
**Solution:** Run `npx prisma generate` or `make db-generate`

## Development Workflow

### Making Schema Changes

1. Edit `backend/prisma/schema.prisma`
2. Push changes: `make db-push`
3. Regenerate client: `make db-generate`
4. Restart server: `make dev`

### Adding New API Endpoints

1. Add route in `backend/src/server.ts`
2. Test with curl or Postman
3. Update README.md and CLAUDE.md
4. Add to frontend (when available)

### Debugging

**View server logs:**
```bash
# Development
make dev

# Production with PM2
pm2 logs ghost-bridge
```

**Check database:**
```bash
npx prisma studio
# Opens GUI at http://localhost:5555
```

**Test webhook manually:**
```bash
curl -X POST http://localhost:5000/api/ghost/webhook \
  -H "Content-Type: application/json" \
  -H "X-User-ID: user-id-here" \
  -d '{
    "post": {
      "current": {
        "id": "test123",
        "title": "Test Post",
        "slug": "test-post",
        "url": "https://blog.com/test-post"
      }
    }
  }'
```

## Security Best Practices

1. **Never commit .env files** - Use .env.example as template
2. **Rotate secrets regularly** - Especially app passwords
3. **Use HTTPS in production** - Required for OAuth, recommended for webhooks
4. **Validate webhook signatures** - Set `GHOST_WEBHOOK_SECRET`
5. **Encrypt sensitive data** - App passwords should be encrypted at rest (TODO)
6. **Rate limiting** - Add rate limiting middleware (TODO)
7. **Input validation** - Validate all API inputs (TODO)

## Future Enhancements

- [ ] Full OAuth implementation for AT Protocol
- [ ] Frontend UI for user management
- [ ] Encryption for app passwords at rest
- [ ] Rate limiting and throttling
- [ ] Post scheduling support
- [ ] Image upload to Bluesky
- [ ] Thread support for long posts
- [ ] Delete/update sync (when post deleted in Ghost)
- [ ] Multi-account support (one user, multiple Bluesky accounts)
- [ ] Analytics dashboard
- [ ] Email notifications for sync failures

## File Structure

```
ghost-atproto-fullstack/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   ├── public/
│   │   └── client-metadata.json   # OAuth client metadata
│   ├── src/
│   │   └── server.ts              # Main application
│   ├── .env                       # Environment variables (DO NOT COMMIT)
│   ├── .env.example               # Environment template
│   ├── Makefile                   # Build/setup automation
│   ├── nginx-bridge.conf          # Nginx configuration snippet
│   ├── package.json               # Dependencies
│   └── tsconfig.json              # TypeScript config
├── frontend/                      # Next.js frontend (TODO)
├── CLAUDE.md                      # This file
└── README.md                      # User documentation
```

## Testing Checklist

- [ ] Database setup works (`make setup`)
- [ ] Server starts without errors (`make dev`)
- [ ] Health check responds (`GET /api/health`)
- [ ] Can create user (`POST /api/users`)
- [ ] Can list users (`GET /api/users`)
- [ ] Ghost webhook processes successfully
- [ ] Post appears in database (`GET /api/posts`)
- [ ] Post appears on Bluesky timeline
- [ ] Sync log records success (`GET /api/sync-logs`)
- [ ] Nginx proxy works at `/bridge` path
- [ ] HTTPS works in production
- [ ] Webhook signature verification works

## Support & Contributing

For issues or questions:
1. Check the troubleshooting section in README.md
2. Review sync logs for error messages
3. Check server logs for detailed errors
4. Open an issue on GitHub (if applicable)

## License

MIT
