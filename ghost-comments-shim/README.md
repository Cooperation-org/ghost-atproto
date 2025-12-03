# Ghost Comments Shim

Lightweight Node.js service that syncs Bluesky replies to your Ghost blog's native comments system.

## Overview

When you publish a Ghost post to Bluesky via the [ATProto Bridge](https://github.com/Cooperation-org/ghost-atproto), people can reply to it on Bluesky. This shim syncs those replies back to Ghost as native comments, so they appear on your blog.

**Architecture:**
```
Bluesky → ATProto Bridge → This Shim → Ghost Database
                ↑                           ↓
         (central service)          (your Ghost server)
```

The shim runs **on your Ghost server** and receives comments from the central bridge.

## Quick Start

### 1. Install the shim on your Ghost server

```bash
# Using npm (recommended)
npm install -g @ghost-atproto/comments-shim

# Or from source
git clone https://github.com/Cooperation-org/ghost-atproto.git
cd ghost-atproto/ghost-comments-shim
npm install && npm run build
```

### 2. Create a Bluesky member in Ghost

All synced comments will appear under this member:

1. Go to **Ghost Admin → Members → New member**
2. Fill in:
   - **Email:** `comments@bsky.atproto.invalid`
   - **Name:** `Bluesky`
   - **Note:** `Bridged comments from Bluesky/ATProto`
   - **Subscribed:** No
3. Save and copy the **member ID** from the URL (24-character hex string)

### 3. Configure the shim

Create a `.env` file:

```bash
# Database (same credentials Ghost uses)
GHOST_DB_TYPE=mysql
GHOST_DB_CONNECTION=mysql://ghost:yourpassword@localhost:3306/ghost_production

# Shared secret (coordinate with the bridge admin - min 32 chars)
BRIDGE_SHARED_SECRET=your-super-secret-key-min-32-characters-long

# The member ID you copied in step 2
BLUESKY_MEMBER_ID=507f1f77bcf86cd799439011

# Port to listen on
PORT=3001
```

### 4. Run the shim

```bash
# Development
npm run dev

# Production
npm start
```

### 5. Configure the bridge

In the ATProto Bridge dashboard:
1. Go to Settings → Comment Sync
2. Enter your shim URL (e.g., `http://your-ghost-server:3001`)
3. Enter the same shared secret you configured in step 3

## Configuration Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `GHOST_DB_TYPE` | Yes | `mysql` or `sqlite` |
| `GHOST_DB_CONNECTION` | Yes | Database connection string |
| `BRIDGE_SHARED_SECRET` | Yes | Shared secret with bridge (32+ chars) |
| `BLUESKY_MEMBER_ID` | Yes | Ghost member ID (24-char hex) |
| `PORT` | No | Port to listen on (default: 3001) |

### Finding your Ghost database credentials

**For MySQL (most common):**
```bash
cat /var/www/ghost/config.production.json | grep -A5 database
```

**For SQLite:**
```bash
# Usually at:
/var/www/ghost/content/data/ghost.db
```

## Running as a Service

### Systemd (recommended)

Create `/etc/systemd/system/ghost-comments-shim.service`:

```ini
[Unit]
Description=Ghost Bluesky Comments Shim
After=network.target ghost.service

[Service]
Type=simple
User=ghost
WorkingDirectory=/var/www/ghost-comments-shim
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/var/www/ghost-comments-shim/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable ghost-comments-shim
sudo systemctl start ghost-comments-shim
sudo systemctl status ghost-comments-shim
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

## API Reference

### POST /comments

Insert a Bluesky comment into Ghost.

**Headers:**
- `Authorization: Bearer {BRIDGE_SHARED_SECRET}`
- `Content-Type: application/json`

**Request:**
```json
{
  "post_id": "507f1f77bcf86cd799439011",
  "bsky_handle": "alice.bsky.social",
  "bsky_profile_url": "https://bsky.app/profile/alice.bsky.social",
  "bsky_post_url": "https://bsky.app/profile/alice.bsky.social/post/3abc123",
  "comment_text": "This is my reply",
  "parent_comment_id": null,
  "created_at": "2025-01-15T12:00:00Z"
}
```

**Response (201):**
```json
{
  "comment_id": "507f1f77bcf86cd799439012"
}
```

### GET /health

Health check endpoint.

**Response (200):**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

## Security

- The shim should **only listen on localhost** or be behind a firewall
- Use a strong `BRIDGE_SHARED_SECRET` (32+ characters, random)
- Consider rate limiting at the reverse proxy level
- All user-provided content is sanitized to prevent XSS

## Testing

```bash
npm test
```

## License

MIT
