# Ghost Comments Shim

Lightweight Node.js service that enables inserting Bluesky comments into Ghost's native comments system via direct database injection.

## Overview

This shim runs alongside your self-hosted Ghost instance and provides an HTTP endpoint for the ATProto bridge to inject Bluesky comments directly into Ghost's database. All comments appear under a single "Bluesky" member in Ghost.

## Installation

```bash
npm install @ghost-atproto/comments-shim
```

Or from source:

```bash
git clone <repo>
cd ghost-comments-shim
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Database Type
GHOST_DB_TYPE=mysql  # or sqlite

# Database Connection
# MySQL: mysql://user:password@localhost:3306/ghost_production
# SQLite: /var/www/ghost/content/data/ghost.db
GHOST_DB_CONNECTION=mysql://ghost:password@localhost:3306/ghost_production

# Shared secret for bridge authentication (min 32 chars)
BRIDGE_SHARED_SECRET=your-super-secret-key-min-32-characters-long

# Ghost member ID for the Bluesky member (obtain from Ghost Admin)
BLUESKY_MEMBER_ID=507f1f77bcf86cd799439011

# Port (default: 3001)
PORT=3001
```

### Getting the Bluesky Member ID

Before running the shim, create a "Bluesky" member in Ghost:

1. Go to Ghost Admin → Members
2. Create new member:
   - Email: `comments@bsky.atproto.invalid` (`.invalid` TLD prevents email sending)
   - Name: `Bluesky`
   - Note: `Bridged comments from Bluesky/ATProto`
   - Subscribed: No
   - Add label: `bluesky-bridge`
3. Copy the member ID from the URL or via Ghost Admin API

Alternatively, use the bridge's admin interface to create the member automatically.

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

### Systemd Service

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

## API

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

**Error Responses:**
- `400`: Invalid request body
- `401`: Invalid or missing authorization
- `500`: Internal server error

### GET /health

Health check endpoint.

**Response (200):**
```json
{
  "status": "ok"
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
