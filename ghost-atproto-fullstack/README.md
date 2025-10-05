# Ghost to AT Protocol Integration

A multi-tenant Ghost CMS integration that automatically publishes posts to AT Protocol networks (Bluesky) using a hybrid authentication approach (OAuth + App Passwords).

## Features

- **Multi-tenant**: Each Ghost admin can connect their own Ghost blog and Bluesky account
- **Hybrid Authentication**: Supports both OAuth (preferred) and App Passwords (fallback)
- **Any Ghost Server**: Works with any Ghost installation via Admin API
- **Automatic Posting**: Posts to Bluesky when Ghost posts are published
- **Webhook Integration**: Secure signature verification
- **Separate Database**: Independent MySQL database for tracking users and posts

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 5.7+ or 8.0+
- A Ghost blog (local or remote)
- A Bluesky account

### Installation

1. **Clone and navigate to backend**
   ```bash
   cd backend
   ```

2. **Install dependencies and set up database**
   ```bash
   npm install
   export MYSQL_PWD=your_mysql_root_password
   make setup
   ```

   This will:
   - Create `ghost_atproto` database
   - Create `ghost_atproto` MySQL user with random password
   - Push database schema
   - Generate Prisma client

3. **Update .env with the database password**

   The setup will output a `DATABASE_URL` - copy it to your `.env` file.

4. **Start the backend server**
   ```bash
   make dev
   ```

   Server runs on `http://localhost:5000`

### Configuration

Each Ghost admin needs to:

1. **Create a user account** in the system (via API or frontend)
2. **Add their Ghost credentials**:
   - Ghost URL (e.g., `https://blog.example.com`)
   - Ghost Admin API Key
3. **Add their Bluesky credentials** (one of):
   - **Option A (Recommended)**: OAuth flow (future implementation)
   - **Option B (Current)**: App Password from Bluesky settings

### Connect Ghost Webhook

In your Ghost Admin panel:

1. Go to **Settings → Integrations → Add custom integration**
2. Name it "Bluesky Publisher"
3. Add a webhook:
   - **Event**: `Post published`
   - **URL**: `http://your-domain.com/api/ghost/webhook`
   - **Add custom header**: `X-User-ID: your-user-id-here`

## API Endpoints

### User Management
- `GET /api/users` - List all users
- `POST /api/users` - Create new user
- `GET /api/users/:id` - Get user details
- `PUT /api/users/:id` - Update user settings

### Posts & Sync
- `GET /api/posts` - View synced posts
- `GET /api/sync-logs` - View sync history
- `POST /api/ghost/webhook` - Ghost webhook endpoint

### Health
- `GET /api/health` - Health check

## Development

### Backend

```bash
cd backend
make dev          # Start development server
make db-push      # Push schema changes
make db-generate  # Regenerate Prisma client
```

### Frontend (Coming Soon)

```bash
cd frontend
yarn install
yarn dev
```

## Architecture

```
┌─────────────┐         Webhook          ┌──────────────────┐
│   Ghost     │ ────────────────────────> │  Backend (Port   │
│   (Any URL) │                           │     5000)        │
└─────────────┘                           └──────────────────┘
                                                   │
                                          ┌────────┴────────┐
                                          │                 │
                                    ┌─────▼─────┐    ┌─────▼──────┐
                                    │  MySQL    │    │  Bluesky   │
                                    │ (ghost_   │    │  API       │
                                    │  atproto) │    │            │
                                    └───────────┘    └────────────┘
```

## Deployment with Nginx

### Nginx Configuration

Create `/etc/nginx/sites-available/ghost-atproto`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
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
}
```

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/ghost-atproto /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL with Let's Encrypt

```bash
sudo certbot --nginx -d your-domain.com
```

## Environment Variables

```bash
# Server
PORT=5000
BASE_URL=https://your-domain.com
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL="mysql://ghost_atproto:password@localhost:3306/ghost_atproto"

# Security
GHOST_WEBHOOK_SECRET=random-secret-here

# OAuth (for future OAuth flow)
OAUTH_CLIENT_ID=https://your-domain.com/client-metadata.json
OAUTH_REDIRECT_URI=https://your-domain.com/api/oauth/callback

# AT Protocol
ATPROTO_SERVICE=https://bsky.social
```

## Security Notes

- Never commit `.env` files
- Use strong passwords for MySQL users
- Enable Ghost webhook signature verification in production
- Use HTTPS in production (required for OAuth)
- Rotate secrets regularly
- App passwords should be stored securely (encrypted at rest in production)

## Troubleshooting

### Database connection issues
- Verify MySQL credentials in `.env`
- Check MySQL user permissions: `GRANT ALL PRIVILEGES ON ghost_atproto.* TO 'ghost_atproto'@'localhost';`

### Webhook not receiving posts
- Verify Ghost webhook URL is correct
- Check `X-User-ID` header is set
- Review sync logs: `GET /api/sync-logs`

### Bluesky posting fails
- Verify Bluesky handle and app password
- Check app password is active in Bluesky settings
- Review error in sync logs

## License

MIT

