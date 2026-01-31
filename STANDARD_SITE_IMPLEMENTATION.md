# Standard.site Implementation Guide

This document explains the standard.site integration in ghost-atproto.

## What is standard.site?

standard.site is a set of unified lexicons (schemas) for long-form publishing on AT Protocol. It allows Ghost blogs to publish as proper documents instead of social posts, making them discoverable in the "long-form Atmosphere" ecosystem.

## Key Benefits

- **Proper representation**: Blog posts appear as articles, not tweets
- **Better discovery**: Content indexed by long-form readers (like Leaflet)
- **Canonical URLs**: Posts link back to original Ghost blog
- **Interoperability**: Works with any app that supports standard.site
- **Future-proof**: As ecosystem grows, automatic compatibility

## Architecture

### Database Schema

New fields added to support standard.site:

**User table:**
- `standard_site_publication_uri` - AT-URI of publication record
- `standard_site_publication_rkey` - rkey for quick lookups
- `use_standard_site` - boolean toggle (default: false)
- `standard_site_dual_post` - boolean for dual posting (default: false)
- `publication_name` - blog name (from Ghost or custom)
- `publication_description` - blog description (from Ghost or custom)

**Post table:**
- `standard_site_document_uri` - AT-URI of document record

### Key Components

1. **`/backend/src/lib/standard-site.ts`**
   - Core functions for creating publication and document records
   - Handles standard.site lexicon formatting

2. **`/backend/src/routes/standard-site.ts`**
   - API endpoints for managing standard.site settings
   - Publication preview, enable/disable, settings update

3. **`/backend/src/routes/atproto.ts`**
   - Modified `/publish` endpoint with standard.site support
   - Automatically chooses format based on user settings

4. **`/backend/src/routes/well-known.ts`**
   - `.well-known/site.standard.publication` endpoint
   - Required for domain verification

5. **`/backend/src/lib/ghost-admin.ts`**
   - `fetchGhostSiteMetadata()` function
   - Fetches blog name, description, icon from Ghost API

## How It Works

### One-Time Setup (per user)

1. User enables standard.site in settings
2. System fetches publication metadata from Ghost API
3. Creates `site.standard.publication` record on AT Protocol
4. Stores publication URI in database
5. User configures domain to serve `.well-known` endpoint

### Publishing Flow

When user publishes a post:

**If `use_standard_site = true`:**
1. Get or create publication record (cached in DB)
2. Create `site.standard.document` record with:
   - Title, content, slug
   - Link back to publication
   - Published date
3. Store document URI in database
4. **Optional**: If `standard_site_dual_post = true`, also create social post

**If `use_standard_site = false`:**
- Uses legacy `app.bsky.feed.post` (unchanged)

### Dual Posting

Users can enable dual posting to get both:
- **Document**: Full article in long-form readers
- **Social post**: Short update in social feeds (using customText)

This is opt-in and defaults to OFF (per erlend.sh's feedback).

## API Endpoints

### GET `/api/standard-site/status`
Get current standard.site status for authenticated user.

**Response:**
```json
{
  "enabled": true,
  "dualPost": false,
  "publication": {
    "uri": "at://did:plc:abc123/site.standard.publication/xyz",
    "rkey": "xyz",
    "name": "My Blog",
    "description": "Thoughts on tech",
    "url": "https://myblog.com"
  }
}
```

### GET `/api/standard-site/publication-preview`
Fetch publication metadata from Ghost (for preview before enabling).

**Response:**
```json
{
  "url": "https://myblog.com",
  "name": "My Blog",
  "description": "Thoughts on tech",
  "icon": "https://myblog.com/icon.png",
  "fromGhost": {
    "title": "My Blog",
    "description": "Thoughts on tech"
  }
}
```

### POST `/api/standard-site/enable`
Enable standard.site and create publication record.

**Request:**
```json
{
  "publicationName": "My Blog",
  "publicationDescription": "Thoughts on tech",
  "dualPost": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Standard.site enabled successfully",
  "publication": {
    "uri": "at://did:plc:abc123/site.standard.publication/xyz",
    "rkey": "xyz",
    "name": "My Blog",
    "url": "https://myblog.com"
  },
  "settings": {
    "useStandardSite": true,
    "dualPost": false
  }
}
```

### POST `/api/standard-site/disable`
Disable standard.site (keeps publication record).

**Response:**
```json
{
  "success": true,
  "message": "Standard.site disabled. Publication record preserved."
}
```

### PATCH `/api/standard-site/settings`
Update standard.site settings.

**Request:**
```json
{
  "dualPost": true,
  "publicationName": "Updated Name",
  "publicationDescription": "Updated description"
}
```

### POST `/api/atproto/publish`
Publishes post (automatically uses standard.site if enabled).

**Request:**
```json
{
  "postId": "post-id",
  "customText": "Check out my new post!"
}
```

**Response (standard.site):**
```json
{
  "success": true,
  "message": "Post published to standard.site successfully",
  "postId": "post-id",
  "title": "My Post Title",
  "format": "standard.site",
  "standardSiteDocumentUri": "at://did:plc:abc/site.standard.document/xyz",
  "standardSitePublicationUri": "at://did:plc:abc/site.standard.publication/abc",
  "socialPostUri": "at://did:plc:abc/app.bsky.feed.post/123",
  "dualPost": true
}
```

## Domain Configuration

### The .well-known Requirement

Standard.site requires a `.well-known/site.standard.publication` endpoint at your domain that returns your publication's AT-URI.

**Request:**
```
GET https://yourblog.com/.well-known/site.standard.publication
```

**Response:**
```
at://did:plc:abc123xyz/site.standard.publication/3kz5tgr2bnd2p
```

### nginx Configuration

If your Ghost blog is at `yourblog.com` and the bridge is at `bridge.yourdomain.com`:

```nginx
server {
    server_name yourblog.com;

    # Existing Ghost configuration...
    location / {
        proxy_pass http://ghost:2368;
        # ... ghost proxy settings
    }

    # Add this to proxy .well-known requests to the bridge
    location /.well-known/site.standard.publication {
        # Option 1: Proxy to bridge with ghostUrl parameter
        proxy_pass http://bridge.yourdomain.com:5000/.well-known/site.standard.publication?ghostUrl=https://yourblog.com;

        # Option 2: Proxy to bridge with handle parameter
        # proxy_pass http://bridge.yourdomain.com:5000/.well-known/site.standard.publication?handle=yourhandle.bsky.social;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Apache Configuration

```apache
<VirtualHost *:443>
    ServerName yourblog.com

    # Existing Ghost configuration...
    ProxyPass / http://localhost:2368/
    ProxyPassReverse / http://localhost:2368/

    # Add this to proxy .well-known requests to the bridge
    ProxyPass /.well-known/site.standard.publication http://bridge.yourdomain.com:5000/.well-known/site.standard.publication?ghostUrl=https://yourblog.com
    ProxyPassReverse /.well-known/site.standard.publication http://bridge.yourdomain.com:5000/.well-known/site.standard.publication

    # ... SSL settings, etc.
</VirtualHost>
```

### Testing the .well-known Endpoint

Once configured:

```bash
curl https://yourblog.com/.well-known/site.standard.publication
```

Should return:
```
at://did:plc:abc123xyz/site.standard.publication/3kz5tgr2bnd2p
```

## Migration from Legacy Format

### For New Posts

Once standard.site is enabled, all new posts automatically use the document format.

### For Old Posts

Old posts remain as social posts (`app.bsky.feed.post`) unless manually migrated.

**To migrate old posts (future feature):**
1. Go to Settings → Standard.site
2. Click "Migrate Old Posts"
3. Select posts to migrate
4. System creates document records for selected posts

**Note:** Migration is optional and manual to give users control.

## Testing

### Prerequisites

1. Have DATABASE_URL configured in `.env`
2. Run migration: `cd backend && npx prisma migrate deploy`
3. Have a Ghost blog with Admin API key
4. Have Bluesky account credentials

### Test Flow

1. **Enable standard.site:**
```bash
curl -X POST http://localhost:5000/api/standard-site/enable \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "publicationName": "Test Blog",
    "publicationDescription": "Testing standard.site",
    "dualPost": false
  }'
```

2. **Check status:**
```bash
curl http://localhost:5000/api/standard-site/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

3. **Publish a post:**
```bash
curl -X POST http://localhost:5000/api/atproto/publish \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "postId": "your-post-id",
    "customText": "Check out my new article!"
  }'
```

4. **Verify .well-known endpoint:**
```bash
curl "http://localhost:5000/.well-known/site.standard.publication?handle=yourhandle.bsky.social"
```

## Troubleshooting

### "Ghost URL and API key are required"
- Ensure user has `ghostUrl` and `ghostApiKey` configured in profile
- Check settings page: `/dashboard/settings`

### "Failed to create publication"
- Verify Bluesky credentials are correct
- Check if user is authenticated with AT Protocol
- Look at backend logs for detailed error

### ".well-known endpoint returns 404"
- Verify nginx/Apache configuration is correct
- Check if bridge is running: `curl http://bridge:5000/api/health`
- Test with query parameter: `curl "http://bridge:5000/.well-known/site.standard.publication?handle=yourhandle.bsky.social"`

### "Publication already exists"
- This is normal if you've already enabled standard.site
- To reset, manually set `standard_site_publication_uri = NULL` in database

## Future Enhancements

- [ ] Frontend UI for enabling/disabling standard.site
- [ ] Publication preview before creating record
- [ ] Bulk migration tool for old posts
- [ ] Icon upload support (currently not implemented)
- [ ] Ability to edit publication metadata
- [ ] Analytics for document views vs social post views

## References

- [standard.site Documentation](https://standard.site/)
- [standard.site on GitHub](https://github.com/whtwnd/standard-site)
- [Leaflet.pub Implementation](https://lab.leaflet.pub/3md4qsktbms24)
- [GitHub Issue #64](https://github.com/Cooperation-org/ghost-atproto/issues/64)
