# Bluesky Comment Sync Setup Guide

This guide explains how to set up the Bluesky comment syncing feature for your Ghost site.

## Overview

The comment sync feature has two components:

1. **Ghost Comments Shim** - A lightweight Node.js service that runs alongside your Ghost instance and inserts comments directly into Ghost's database
2. **Bridge Backend** - The central ATProto bridge that fetches replies from Bluesky and sends them to the shim

## Architecture

```
┌──────────────────┐
│  Bluesky Network │
│   (ATProto)      │
└────────┬─────────┘
         │
         │ Fetch thread replies
         ▼
┌──────────────────┐
│  Bridge Backend  │
│  (This Service)  │
│  - Fetches posts │
│  - Maps comments │
│  - Calls shim    │
└────────┬─────────┘
         │
         │ HTTP POST /comments
         ▼
┌──────────────────┐        ┌──────────────┐
│  Comments Shim   │───────▶│ Ghost MySQL  │
│  (Per Instance)  │ INSERT │ comments tbl │
│  - Validates     │        └──────────────┘
│  - Sanitizes     │
│  - Creates IDs   │
└──────────────────┘
```

## Setup Instructions

### Step 1: Create Bluesky Member in Ghost

Before syncing can work, you need to create a special "Bluesky" member in your Ghost instance. All Bluesky comments will appear under this member.

**Option A: Using the Bridge Admin UI (Recommended)**

1. Log into the bridge admin dashboard
2. Navigate to Settings → Ghost Configuration
3. Ensure your Ghost Admin API key is configured
4. Click "Create Bluesky Member" button
5. The bridge will automatically create the member and store the member ID

**Option B: Manual Setup via Ghost Admin**

1. Go to Ghost Admin → Members → New Member
2. Fill in:
   - Email: `comments@bsky.atproto.invalid` (`.invalid` TLD prevents email sending)
   - Name: `Bluesky`
   - Note: `Bridged comments from Bluesky/ATProto`
   - Subscribed: No
   - Labels: `bluesky-bridge`
3. Save the member
4. Copy the member ID from the URL (e.g., `64abc123def456789...`)
5. Store this ID in the shim's `.env` file as `BLUESKY_MEMBER_ID`

**Option C: Using the Ghost Admin API**

```bash
curl -X POST 'https://your-ghost-site.com/ghost/api/admin/members/' \
  -H 'Authorization: Ghost <your-admin-token>' \
  -H 'Content-Type: application/json' \
  -H 'Accept-Version: v5.0' \
  -d '{
    "members": [{
      "email": "comments@bsky.atproto.invalid",
      "name": "Bluesky",
      "note": "Bridged comments from Bluesky/ATProto",
      "subscribed": false,
      "labels": [{"name": "bluesky-bridge"}]
    }]
  }'
```

### Step 2: Install and Configure the Shim

The shim must be installed on the same server as your Ghost instance.

1. **Install the shim:**
   ```bash
   cd /var/www
   git clone <this-repo>
   cd ghost-atproto/ghost-comments-shim
   npm install
   npm run build
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   nano .env
   ```

   Fill in:
   ```env
   GHOST_DB_TYPE=mysql  # or sqlite
   GHOST_DB_CONNECTION=mysql://ghost:password@localhost:3306/ghost_production
   BRIDGE_SHARED_SECRET=your-super-secret-key-min-32-characters-long
   BLUESKY_MEMBER_ID=64abc123def456789...  # From Step 1
   PORT=3001
   ```

3. **Test the shim:**
   ```bash
   npm start
   ```

   Test health:
   ```bash
   curl http://localhost:3001/health
   ```

4. **Set up as a system service (recommended):**

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

### Step 3: Configure the Bridge

In the bridge backend `.env`, add:

```env
SHIM_URL=http://localhost:3001
SHIM_SHARED_SECRET=your-super-secret-key-min-32-characters-long
```

**Important:** The `SHIM_SHARED_SECRET` must match the `BRIDGE_SHARED_SECRET` in the shim's `.env`.

### Step 4: Test the Integration

1. **Verify Bluesky member exists:**
   ```bash
   curl http://localhost:5000/api/ghost/bluesky-member/status \
     -H 'Authorization: Bearer <your-token>'
   ```

2. **Create a test post on Ghost and publish it to Bluesky**

3. **Reply to the post on Bluesky**

4. **Manually trigger comment sync** (polling is implemented separately):
   ```typescript
   import { syncCommentsForPost } from './src/services/comment-sync';
   import { createShimClient } from './src/lib/shim-client';

   const shimClient = createShimClient();
   const result = await syncCommentsForPost('your-post-id', shimClient);
   console.log(`Synced ${result.newComments} comments`);
   ```

5. **Check Ghost Admin** → Your Post → Comments to see the synced comment

## API Reference

### Bridge Endpoints

#### POST /api/ghost/bluesky-member/setup
Create or get the Bluesky member for comment sync.

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "member": {
    "id": "64abc123...",
    "name": "Bluesky",
    "email": "comments@bsky.atproto.invalid"
  }
}
```

#### GET /api/ghost/bluesky-member/status
Check if Bluesky member is configured.

**Response:**
```json
{
  "isConfigured": true,
  "isSetup": true,
  "memberId": "64abc123..."
}
```

### Shim Endpoints

#### POST /comments
Insert a Bluesky comment into Ghost.

**Headers:**
- `Authorization: Bearer <BRIDGE_SHARED_SECRET>`
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

## Database Schema

### Bridge (MySQL)

```sql
CREATE TABLE comment_mappings (
    id VARCHAR(191) PRIMARY KEY,
    bsky_reply_uri VARCHAR(191) UNIQUE NOT NULL,
    ghost_comment_id VARCHAR(191) NOT NULL,
    post_id VARCHAR(191) NOT NULL,
    bsky_author_did VARCHAR(191),
    bsky_author_handle VARCHAR(191),
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    INDEX (post_id)
);
```

### Ghost (MySQL/SQLite)

The shim inserts directly into Ghost's existing `comments` table:

```sql
comments (
    id VARCHAR(24) PRIMARY KEY,  -- 24-char hex
    post_id VARCHAR(24) NOT NULL,
    member_id VARCHAR(24) NOT NULL,  -- BLUESKY_MEMBER_ID
    parent_id VARCHAR(24),
    status VARCHAR(50) DEFAULT 'published',
    html TEXT,
    edited_at DATETIME NULL,
    created_at DATETIME,
    updated_at DATETIME
)
```

## Comment HTML Format

Comments are inserted with inline styles for theme compatibility:

```html
<p><a href="https://bsky.app/profile/alice.bsky.social" style="color:inherit;text-decoration:none;"><strong>@alice.bsky.social</strong></a></p>
<p>This is my reply</p>
<p style="font-size:0.85em;opacity:0.7;"><a href="https://bsky.app/profile/alice.bsky.social/post/abc123">View on Bluesky ↗</a></p>
```

## Security Considerations

1. **Shared Secret**: Use a strong random secret (32+ characters)
2. **Network Access**: The shim should only be accessible from localhost or behind a firewall
3. **Database Access**: The shim needs INSERT permission on Ghost's comments table
4. **Sanitization**: All user content is sanitized to prevent XSS (done on both bridge and shim)
5. **Rate Limiting**: Consider adding rate limiting at the reverse proxy level

## Troubleshooting

### Comments not appearing in Ghost

1. Check shim is running: `curl http://localhost:3001/health`
2. Check shim logs for errors: `journalctl -u ghost-comments-shim -f`
3. Verify database credentials in shim `.env`
4. Verify BLUESKY_MEMBER_ID exists in Ghost members table
5. Check bridge logs for sync errors

### Authentication errors

- Ensure `BRIDGE_SHARED_SECRET` and `SHIM_SHARED_SECRET` match exactly
- Secrets must be at least 32 characters

### Database connection errors

- For MySQL: Test connection with `mysql -u ghost -p -h localhost ghost_production`
- For SQLite: Verify file path and permissions
- Ensure Ghost user has necessary permissions

### Comments appear but with wrong formatting

- Check that HTML sanitization is working
- Verify the Bluesky member name displays correctly in Ghost Admin

## Next Steps

- Implement scheduled polling to automatically sync new comments
- Add webhook from Ghost to sync Ghost comments back to Bluesky
- Link real Ghost members to their Bluesky accounts for attribution
- Add support for likes/reactions on comments

## Support

For issues and questions, please file an issue in the GitHub repository.
