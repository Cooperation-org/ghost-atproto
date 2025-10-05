# Ghost to AT Protocol Bridge - Developer Documentation

## Project Overview

This is a multi-tenant service that bridges Ghost CMS blogs to Bluesky (AT Protocol). Each Ghost admin can connect their own Ghost blog and Bluesky account through a web dashboard. Posts are automatically published to Bluesky when published in Ghost.

## Architecture

### Components

1. **Backend (Node.js + Express + Prisma)**
   - Port: 5000
   - Database: MySQL (`ghost_atproto` database)
   - Authentication: JWT-based sessions + hybrid Bluesky auth (OAuth + App Passwords)
   - Communication: REST API + Ghost Webhooks

2. **Frontend (Next.js 15 + React + Material-UI)**
   - Port: 3000
   - Base path: `/bridge`
   - Dashboard UI for managing Ghost/Bluesky connections
   - Login, settings, stats, and logs

3. **Nginx Reverse Proxy**
   - Frontend at `/bridge` → port 3000
   - Backend API at `/api/*` and `/bridge/api/*` → port 5000
   - Handles SSL termination in production

### Data Flow

```
User Browser → Nginx → /bridge → Next.js Frontend (port 3000)
                    ↓
                 /api → Express Backend (port 5000)
                         ↓
                    MySQL Database
                         ↓
Ghost CMS → Webhook → /api/ghost/webhook → Backend → Bluesky API
```

## Quick Start

### 1. Backend Setup

```bash
cd ghost-atproto-fullstack/backend

# Install dependencies
npm install

# Set up database
export MYSQL_PWD=your_mysql_root_password
make setup

# This creates:
# - ghost_atproto database
# - ghost_atproto MySQL user
# - Database schema
# - Prints DATABASE_URL to add to .env

# Update .env with the DATABASE_URL from make setup

# Start backend
npm run dev
```

Backend runs on http://localhost:5000

### 2. Frontend Setup

```bash
cd ghost-atproto-fullstack/frontend

# Install dependencies
yarn install

# Start frontend
yarn dev
```

Frontend runs on http://localhost:3000

### 3. Nginx Configuration

Create `/etc/nginx/sites-available/bridge`:

```nginx
server {
    listen 80;
    server_name _;

    # Frontend - Next.js (port 3000) - serves at /bridge
    location /bridge {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API - Express (port 5000)
    location ~ ^/(api|bridge/api)/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/bridge /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Access dashboard at: **http://your-server/bridge**

## Database Schema

### User Model
- **Multi-tenant**: Each user represents a Ghost admin with their own credentials
- **Authentication**: Email-based login with JWT tokens
- **Ghost credentials**: URL and Admin API key
- **Bluesky credentials**: Handle and app password (or OAuth session)
- Fields: `id`, `email`, `name`, `atprotoHandle`, `atprotoAppPassword`, `ghostUrl`, `ghostApiKey`, `createdAt`, `updatedAt`

### Post Model
- Tracks posts synced from Ghost to Bluesky
- Maps Ghost post ID to Bluesky post URI/CID
- Fields: `id`, `title`, `content`, `slug`, `status`, `ghostId`, `ghostSlug`, `ghostUrl`, `atprotoUri`, `atprotoCid`, `publishedAt`, `userId`

### OAuthSession Model
- For AT Protocol OAuth-based authentication (future enhancement)
- Stores refresh/access tokens with DPoP key binding
- Fields: `id`, `userId`, `accessToken`, `refreshToken`, `dpopKeyJwk`, `sub`, `scope`, `expiresAt`

### SyncLog Model
- Audit trail of all sync operations
- Error tracking and retry logic support
- Fields: `id`, `action`, `status`, `source`, `target`, `postId`, `ghostId`, `atprotoUri`, `error`, `retryCount`, `userId`, `createdAt`

## API Endpoints

### Authentication

**Login**
```
POST /api/auth/login
Body: { email: "user@example.com" }
Response: { user: {...}, token: "..." }
Note: Auto-creates user on first login
```

**Logout**
```
POST /api/auth/logout
Response: { message: "Logged out successfully" }
```

**Get Current User**
```
GET /api/auth/me
Headers: Authorization: Bearer <token>
Response: { id, email, name, atprotoHandle, ghostUrl, ... }
```

**Update Current User**
```
PUT /api/auth/me
Headers: Authorization: Bearer <token>
Body: {
  name?: string,
  ghostUrl?: string,
  ghostApiKey?: string,
  atprotoHandle?: string,
  atprotoAppPassword?: string
}
```

**Get Current User's Posts**
```
GET /api/auth/posts
Headers: Authorization: Bearer <token>
Response: [{ id, title, ghostId, atprotoUri, ... }]
```

**Get Current User's Sync Logs**
```
GET /api/auth/logs
Headers: Authorization: Bearer <token>
Response: [{ id, action, status, error, ... }]
```

### Health Check
```
GET /api/health
Response: { status: 'OK', message: 'Ghost ATProto Backend is running!' }
```

### Ghost Webhook

**Webhook Handler**
```
POST /api/ghost/webhook
Headers:
  X-Ghost-Signature: sha256=... (optional)
  X-User-ID: user-id-here
  Content-Type: application/json

Body: Ghost webhook payload (post.published event)
```

## User Workflow

### 1. Sign Up / Login
1. Visit `/bridge` in browser
2. Redirected to `/bridge/login`
3. Enter email address
4. User auto-created on first login, JWT token issued

### 2. Configure Credentials
1. Navigate to Settings (sidebar)
2. **Ghost Configuration**:
   - Enter Ghost URL (e.g., `https://yourblog.com`)
   - Enter Ghost Admin API Key (from Ghost Admin → Integrations)
3. **Bluesky Configuration**:
   - Enter Bluesky handle (e.g., `yourname.bsky.social`)
   - Generate and enter App Password from Bluesky Settings → App Passwords
4. Click "Save Settings"

### 3. Set Up Ghost Webhook
1. In Ghost Admin → Settings → Integrations → Add custom integration
2. Name: "Bluesky Bridge"
3. Add webhook:
   - Event: **Post published**
   - Target URL: `https://your-domain.com/api/ghost/webhook`
   - Add custom header: `X-User-ID: your-user-id-from-dashboard`

### 4. Publish & Sync
1. Publish a post in Ghost
2. Ghost sends webhook to `/api/ghost/webhook`
3. Backend:
   - Verifies webhook signature (optional)
   - Looks up user by X-User-ID header
   - Logs in to Bluesky with user's app password
   - Posts to Bluesky with title + URL
   - Saves post and sync log to database
4. View sync status in Dashboard → Sync Logs

## Hybrid Authentication Strategy

The system supports both authentication methods:

### App Password (Current - Working)
1. User generates app password in Bluesky Settings → App Passwords
2. User enters app password in dashboard settings
3. Backend uses `BskyAgent.login()` with handle + password
4. Simple, immediate, works for automated posting

### OAuth (Future - Planned)
1. User clicks "Connect with Bluesky" in dashboard
2. Redirected to Bluesky OAuth flow
3. Backend exchanges code for tokens
4. Tokens stored in OAuthSession table with DPoP binding
5. Tokens refresh automatically when expired

**Fallback Logic:**
```javascript
async function getAgentForUser(userId) {
  // Try OAuth first (if implemented)
  if (hasValidOAuthSession) {
    return agentFromOAuth();
  }

  // Fallback to app password
  if (hasAppPassword) {
    return agentFromAppPassword();
  }

  return null; // User not configured
}
```

## Dashboard Features

### Current
- ✅ Login page (email-based, auto-creates users)
- ✅ Dashboard home with stats (posts, syncs, status)
- ✅ Settings page (Ghost + Bluesky credentials)
- ✅ Responsive sidebar layout
- ✅ Material-UI components

### Future (Extensible Architecture)
- [ ] Posts page (view all synced posts)
- [ ] Sync logs page (detailed logs with filtering)
- [ ] RSS feed integration
- [ ] Analytics dashboard
- [ ] Webhook management UI
- [ ] OAuth flow UI
- [ ] Multi-account support
- [ ] Scheduled posting
- [ ] Image upload support

## Environment Variables

### Backend `.env`

```bash
# Server
PORT=5000
BASE_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000

# Database (use output from make setup)
DATABASE_URL="mysql://ghost_atproto:password@localhost:3306/ghost_atproto"

# Security
JWT_SECRET=your-secret-key-change-in-production
GHOST_WEBHOOK_SECRET=random-secret-here

# OAuth (future)
OAUTH_CLIENT_ID=https://your-domain.com/client-metadata.json
OAUTH_REDIRECT_URI=https://your-domain.com/api/oauth/callback

# AT Protocol
ATPROTO_SERVICE=https://bsky.social
```

### Frontend `.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:5000
```

## Development Workflow

### Making Schema Changes

```bash
cd backend

# 1. Edit prisma/schema.prisma
vim prisma/schema.prisma

# 2. Push changes to database
make db-push

# 3. Regenerate Prisma client
make db-generate

# 4. Restart backend
npm run dev
```

### Adding New Dashboard Pages

```bash
cd frontend/src/app/dashboard

# Create new page
mkdir new-feature
vim new-feature/page.tsx

# Add to sidebar menu in:
# src/components/layout/DashboardLayout.tsx
```

### Testing Webhook Manually

```bash
# Get your user ID from dashboard or API
USER_ID="clxxxxx"

# Send test webhook
curl -X POST http://localhost:5000/api/ghost/webhook \
  -H "Content-Type: application/json" \
  -H "X-User-ID: $USER_ID" \
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

## Production Deployment

### Systemd Services

**Backend Service** (`/etc/systemd/system/ghost-bridge.service`):
```ini
[Unit]
Description=Ghost to Bluesky Bridge Service
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/ghost-atproto-fullstack/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Frontend Service** (`/etc/systemd/system/ghost-bridge-frontend.service`):
```ini
[Unit]
Description=Ghost Bridge Frontend
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/ghost-atproto-fullstack/frontend
ExecStart=/usr/bin/yarn start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable ghost-bridge ghost-bridge-frontend
sudo systemctl start ghost-bridge ghost-bridge-frontend
```

### SSL with Let's Encrypt

```bash
sudo certbot --nginx -d your-domain.com
```

## Troubleshooting

### Backend won't start
```bash
# Check logs
sudo journalctl -u ghost-bridge -f

# Common issues:
# - DATABASE_URL incorrect → check .env
# - Port 5000 in use → change PORT in .env
# - MySQL not running → sudo systemctl start mysql
```

### Frontend shows "API connection failed"
```bash
# Check backend is running
curl http://localhost:5000/api/health

# Check NEXT_PUBLIC_API_URL in frontend/.env.local
# Should be: http://localhost:5000
```

### Webhook not working
```bash
# Check sync logs in dashboard
# Or query database:
mysql -u ghost_atproto -p ghost_atproto
SELECT * FROM sync_logs ORDER BY createdAt DESC LIMIT 10;

# Common issues:
# - Wrong X-User-ID header
# - User not configured with Bluesky credentials
# - Invalid app password → regenerate in Bluesky
```

### Nginx errors
```bash
# Test config
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Reload after changes
sudo systemctl reload nginx
```

### Database issues
```bash
# Reset database (WARNING: deletes all data)
cd backend
npx prisma db push --force-reset

# View database in GUI
npx prisma studio
# Opens at http://localhost:5555
```

## File Structure

```
ghost-atproto/
├── ghost-atproto-fullstack/
│   ├── backend/
│   │   ├── prisma/
│   │   │   └── schema.prisma          # Database schema
│   │   ├── public/
│   │   │   └── client-metadata.json   # OAuth metadata
│   │   ├── src/
│   │   │   └── server.ts              # Main Express app
│   │   ├── .env                       # Config (DO NOT COMMIT)
│   │   ├── .env.example               # Config template
│   │   ├── Makefile                   # Setup automation
│   │   ├── nginx-bridge.conf          # Nginx config
│   │   └── package.json
│   │
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx           # Home (redirects)
│   │   │   │   ├── login/page.tsx     # Login
│   │   │   │   └── dashboard/
│   │   │   │       ├── page.tsx       # Dashboard home
│   │   │   │       └── settings/page.tsx  # Settings
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   │   └── DashboardLayout.tsx
│   │   │   │   └── providers/
│   │   │   │       └── ThemeProvider.tsx
│   │   │   └── lib/
│   │   │       ├── api.ts             # API client
│   │   │       ├── types.ts           # TypeScript types
│   │   │       └── theme.ts           # MUI theme
│   │   ├── .env.local                 # Frontend config
│   │   ├── next.config.ts             # Next.js config
│   │   └── package.json
│   │
│   ├── README.md                      # User documentation
│   └── CLAUDE.md                      # This file
│
└── README.md
```

## Security Best Practices

1. **Environment Variables**
   - Never commit `.env` files
   - Use strong random values for `JWT_SECRET`
   - Rotate secrets regularly

2. **Database**
   - Use dedicated MySQL user (`ghost_atproto`)
   - Strong password (generated by `make setup`)
   - Regular backups

3. **Ghost Webhooks**
   - Set `GHOST_WEBHOOK_SECRET` in production
   - Verify signatures on webhook endpoint
   - Use HTTPS in production

4. **Bluesky App Passwords**
   - Store securely (consider encryption at rest)
   - Never log or expose in API responses
   - Users should use unique passwords per integration

5. **Authentication**
   - JWT tokens expire after 7 days
   - HTTP-only cookies in production
   - HTTPS required for OAuth

6. **Production Checklist**
   - [ ] SSL certificate installed
   - [ ] Environment variables set correctly
   - [ ] Database backups configured
   - [ ] Webhook signature verification enabled
   - [ ] Rate limiting added (TODO)
   - [ ] Error monitoring setup

## Future Enhancements

- [ ] Full AT Protocol OAuth implementation
- [ ] Encrypt app passwords at rest
- [ ] Rate limiting middleware
- [ ] Input validation with Zod
- [ ] RSS feed ingestion and posting
- [ ] Analytics dashboard (posts per day, engagement, etc.)
- [ ] Email notifications for sync failures
- [ ] Image upload to Bluesky
- [ ] Thread support for long posts
- [ ] Delete/update sync (when Ghost post deleted/updated)
- [ ] Multi-account support (one user, multiple Bluesky accounts)
- [ ] Scheduled posting queue
- [ ] Webhook retry logic with exponential backoff
- [ ] Admin panel for managing all users
- [ ] Export/import settings

## Support & Contributing

For issues:
1. Check logs: `sudo journalctl -u ghost-bridge`
2. Check sync logs in dashboard
3. Review troubleshooting section above
4. Check database: `npx prisma studio`

## License

MIT
