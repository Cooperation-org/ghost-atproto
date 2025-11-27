# Bluesky Comments Shim - Implementation Instructions

## Overview

Create a lightweight Node.js shim service that runs alongside self-hosted Ghost instances to enable inserting Bluesky comments into Ghost's native comments system via direct database injection.

## Architecture

```
Bridge (central - ghost-atproto/ghost-atproto-fullstack/backend)
  - ATProto subscription/polling for replies to tracked posts
  - Stores mappings: bsky_post_uri <-> ghost_post_id, bsky_reply_uri <-> ghost_comment_id
  - Calls Ghost Admin API for member creation (one-time "Bluesky" member)
  - Calls Shim HTTP endpoint when new replies found

Shim (per Ghost instance - NEW PACKAGE)
  - Single HTTP endpoint: POST /comments
  - Inserts directly into Ghost's comments table
  - Stateless - config is DB connection + shared secret + bluesky_member_id
  - Returns created comment_id to bridge
```

## Shim Package Details

### Location
Create new directory: `ghost-atproto/ghost-comments-shim/`

This keeps it in the same repo but separate from the backend (which is the central bridge).

it will be published as an npm package and have its own installation on independent ghost servers (not the server where the bridge runs)

### Tech Stack
- Node.js (matches Ghost ecosystem)
- Express or Fastify (minimal)
- mysql2 or better-sqlite3 (Ghost supports both MySQL and SQLite)
- No ORM needed - raw SQL is fine

### Package Structure

```
ghost-comments-shim/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Entry point, Express app
│   ├── config.ts         # Env loading
│   ├── db.ts             # DB connection (mysql2 or better-sqlite3)
│   ├── routes/
│   │   └── comments.ts   # POST /comments handler
│   └── utils/
│       └── ghost-id.ts   # ObjectId generation
├── .env.example
└── README.md
```

### Config (env vars)
```
GHOST_DB_TYPE=mysql|sqlite
GHOST_DB_CONNECTION=mysql://user:pass@localhost/ghost  # or path for sqlite
BRIDGE_SHARED_SECRET=xxx
BLUESKY_MEMBER_ID=abc123...  # Ghost member ID for the single "Bluesky" member
PORT=3001
```

### API Endpoint

```
POST /comments
Authorization: Bearer {BRIDGE_SHARED_SECRET}
Content-Type: application/json

{
    "post_id": "ghost_post_id_here",
    "bsky_handle": "alice.bsky.social",
    "bsky_profile_url": "https://bsky.app/profile/alice.bsky.social",
    "bsky_post_url": "https://bsky.app/profile/alice.bsky.social/post/3abc123",
    "comment_text": "This is my reply",
    "parent_comment_id": null,  // or ghost comment id for threading
    "created_at": "2025-01-15T12:00:00Z"
}

Response 201:
{
    "comment_id": "generated_24char_hex"
}

Response 400/401/500:
{
    "error": "description"
}
```

### Comment HTML Format

The shim builds the HTML for the comment. No custom classes (themes may not support them):

```html
<p><a href="{bsky_profile_url}" style="color:inherit;text-decoration:none;"><strong>@{bsky_handle}</strong></a></p>
<p>{comment_text}</p>
<p style="font-size:0.85em;opacity:0.7;"><a href="{bsky_post_url}">View on Bluesky ↗</a></p>
```

### Ghost Comments Table Schema

```sql
comments (
    id                 VARCHAR(24) PRIMARY KEY,  -- 24-char hex (MongoDB ObjectId style)
    post_id            VARCHAR(24) NOT NULL,     -- FK to posts.id
    member_id          VARCHAR(24) NOT NULL,     -- FK to members.id (use BLUESKY_MEMBER_ID)
    parent_id          VARCHAR(24),              -- FK to comments.id (for replies, nullable)
    status             VARCHAR(50) DEFAULT 'published',
    html               TEXT,
    edited_at          DATETIME NULL,
    created_at         DATETIME,
    updated_at         DATETIME
)
```

### ObjectId Generation

Ghost uses 24-character hex strings like MongoDB ObjectIds:

```javascript
const crypto = require('crypto');
function generateGhostId() {
    return crypto.randomBytes(12).toString('hex');  // 24 chars
}
```

### SQL Insert

```javascript
const commentId = generateGhostId();
const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

await db.execute(`
    INSERT INTO comments (id, post_id, member_id, parent_id, status, html, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'published', ?, ?, ?)
`, [commentId, postId, BLUESKY_MEMBER_ID, parentId || null, html, createdAt, now]);
```

## Bridge Changes Required

### 1. One-time Setup: Create Bluesky Member

Via Ghost Admin API (bridge already has access):

```javascript
const blueskyMember = await ghostAdmin.members.add({
    email: "comments@bsky.atproto.invalid",  // .invalid TLD = never sends mail
    name: "Bluesky",
    note: "Bridged comments from Bluesky/ATProto",
    subscribed: false,
    labels: [{ name: "bluesky-bridge" }]
});
// Store blueskyMember.id in bridge config/DB
```

### 2. New Bridge Endpoint or Job: Sync Comments

When bridge detects replies to a tracked post:

```javascript
// Pseudocode for bridge
async function syncBlueskyReplies(ghostPostId, bskyPostUri) {
    const thread = await atproto.getPostThread(bskyPostUri, { depth: 10 });
    
    for (const reply of thread.replies) {
        // Check if already synced (bridge stores mapping)
        if (await isAlreadySynced(reply.uri)) continue;
        
        // Call shim
        const result = await fetch(`${SHIM_URL}/comments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SHIM_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                post_id: ghostPostId,
                bsky_handle: reply.author.handle,
                bsky_profile_url: `https://bsky.app/profile/${reply.author.handle}`,
                bsky_post_url: `https://bsky.app/profile/${reply.author.handle}/post/${reply.uri.split('/').pop()}`,
                comment_text: reply.record.text,
                parent_comment_id: getParentGhostCommentId(reply.parent),  // from mapping
                created_at: reply.record.createdAt
            })
        });
        
        const { comment_id } = await result.json();
        
        // Store mapping
        await saveMapping(reply.uri, comment_id);
    }
}
```

### 3. New Mapping Table in Bridge DB

Add to existing prisma schema (`ghost-atproto-fullstack/backend/prisma/schema.prisma`):

```prisma
model CommentMapping {
    id              String   @id @default(cuid())
    bskyReplyUri    String   @unique @map("bsky_reply_uri")
    ghostCommentId  String   @map("ghost_comment_id")
    postId          String   @map("post_id")  // FK to Post.id
    bskyAuthorDid   String?  @map("bsky_author_did")
    bskyAuthorHandle String? @map("bsky_author_handle")
    createdAt       DateTime @default(now())
    post            Post     @relation(fields: [postId], references: [id], onDelete: Cascade)

    @@index([postId])
    @@map("comment_mappings")
}
```

Also add to Post model:
```prisma
model Post {
    // ... existing fields ...
    commentMappings CommentMapping[]
}
```

**Note:** The existing Post model already has `ghostId` and `atprotoUri` - the post mapping is already done! This just adds comment tracking.

## Existing Codebase Notes

The bridge already has:
- `src/lib/atproto.ts` - ATProto client (currently just `publishToBluesky`, needs `getPostThread`)
- `src/jobs/scheduler.ts` - Job scheduler for cron tasks
- `src/routes/atproto.ts` - ATProto-related endpoints
- Post model with `ghostId` and `atprotoUri` fields - mapping already exists!

**Where to add comment sync:**
1. Add `getPostThread()` function to `src/lib/atproto.ts`
2. Add `syncComments()` job to `src/jobs/` (or add to scheduler)
3. Add CommentMapping model to prisma schema
4. Add shim client helper to call the shim endpoint

## Future TODO (not this PR)

- [ ] Post Ghost comments back to Bluesky thread
- [ ] Handle replies to bridged comments (comment on Ghost → reply on Bluesky)
- [ ] Real member linking: if a Bluesky user signs up on Ghost with same handle, link their comments
- [ ] Webhook from Ghost → Bridge when new comment posted (for reverse sync)

## Deployment

Shim runs on same server as Ghost, different port. Can be:
- systemd service
- Docker container
- PM2 managed

Example systemd unit:

```ini
[Unit]
Description=Ghost Bluesky Comments Shim
After=network.target ghost.service

[Service]
Type=simple
User=ghost
WorkingDirectory=/var/www/ghost-comments-shim
ExecStart=/usr/bin/node index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Testing

1. Create the single Bluesky member via Admin API
2. Get a valid post_id from Ghost
3. POST to shim with test data
4. Verify comment appears in Ghost Admin and on post page

## Security Notes

- BRIDGE_SHARED_SECRET should be strong (32+ chars)
- Shim should only listen on localhost or be behind firewall
- Consider rate limiting on shim endpoint
- Validate post_id exists before inserting (optional, FK will fail anyway)
