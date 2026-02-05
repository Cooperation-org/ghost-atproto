# Standard.site Integration - Implementation Summary

## Overview

Implemented full support for standard.site lexicons in ghost-atproto bridge, allowing Ghost blogs to publish as proper long-form documents instead of social posts.

## What's Been Implemented

### Backend (Complete)

1. **Database Schema** (`prisma/schema.prisma`)
   - Added fields to User model for publication tracking and settings
   - Added `standardSiteDocumentUri` to Post model
   - Migration file created: `20260131000000_add_standard_site_support`

2. **Core Libraries**
   - `src/lib/standard-site.ts` - Functions for creating publications and documents
   - `src/lib/ghost-admin.ts` - `fetchGhostSiteMetadata()` for blog info

3. **API Routes**
   - `src/routes/standard-site.ts` - Management endpoints:
     - `GET /api/standard-site/status` - Check if enabled
     - `GET /api/standard-site/publication-preview` - Preview metadata from Ghost
     - `POST /api/standard-site/enable` - Enable and create publication
     - `POST /api/standard-site/disable` - Disable (preserves publication)
     - `PATCH /api/standard-site/settings` - Update settings (dual post, metadata)

   - `src/routes/well-known.ts` - Verification endpoint:
     - `GET /.well-known/site.standard.publication` - Returns publication AT-URI

   - `src/routes/atproto.ts` - Modified `/publish` endpoint:
     - Checks `useStandardSite` flag
     - Creates document records when enabled
     - Falls back to legacy social posts when disabled
     - Supports optional dual posting

4. **Documentation**
   - `STANDARD_SITE_IMPLEMENTATION.md` - Complete implementation guide
   - Includes nginx/Apache configuration examples
   - API documentation with examples
   - Testing instructions

### Frontend (Pending)

Still needs:
- Settings UI to enable/disable standard.site
- Publication preview before enabling
- Toggle for dual posting
- Indicators showing which format posts use
- Migration UI for old posts (future enhancement)

## Key Features

### Opt-In Design
- Feature is disabled by default (`use_standard_site = false`)
- Users explicitly enable it in settings
- Existing posts remain unchanged (backward compatible)

### Dual Posting (Optional)
- Users can choose to create both:
  - Document record (for long-form readers)
  - Social post (for social feeds)
- Defaults to OFF per community feedback

### Smart Metadata
- Automatically fetches blog name/description from Ghost API
- Users can preview and edit before creating publication
- Stored in database for future use

### Domain Verification
- `.well-known/site.standard.publication` endpoint
- Supports multiple lookup methods (handle, ghostUrl, userId)
- Works with nginx/Apache reverse proxy

## Migration Strategy

**For new posts:**
- Automatically use standard.site format when enabled

**For old posts:**
- Remain as social posts (no breaking changes)
- Optional manual migration (future feature)
- Both formats coexist peacefully

## Testing

### Prerequisites
```bash
# Install dependencies (remember --ignore-scripts!)
cd backend
npm install --ignore-scripts

# Run migration
npx prisma migrate deploy
```

### Test Endpoints
```bash
# 1. Preview publication metadata
curl http://localhost:5000/api/standard-site/publication-preview \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Enable standard.site
curl -X POST http://localhost:5000/api/standard-site/enable \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"publicationName": "My Blog", "dualPost": false}'

# 3. Publish a post (will use standard.site if enabled)
curl -X POST http://localhost:5000/api/atproto/publish \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"postId": "post-id", "customText": "New post!"}'

# 4. Test .well-known endpoint
curl "http://localhost:5000/.well-known/site.standard.publication?handle=yourhandle.bsky.social"
```

## Next Steps

### Immediate (For Testing)
1. Run database migration
2. Test API endpoints with Postman/curl
3. Deploy to staging environment
4. Configure nginx proxy for .well-known endpoint

### Short-term (Frontend)
1. Add settings UI in dashboard
2. Add publication preview modal
3. Show format indicators on articles page
4. Add toggle switches for standard.site and dual post

### Future Enhancements
1. Icon upload support
2. Bulk migration tool for old posts
3. Analytics: document views vs social post views
4. Publication metadata editor

## Files Changed/Added

### Added
- `backend/src/lib/standard-site.ts`
- `backend/src/routes/standard-site.ts`
- `backend/src/routes/well-known.ts`
- `backend/prisma/migrations/20260131000000_add_standard_site_support/migration.sql`
- `STANDARD_SITE_IMPLEMENTATION.md`
- `STANDARD_SITE_CHANGELOG.md`

### Modified
- `backend/prisma/schema.prisma`
- `backend/src/lib/ghost-admin.ts`
- `backend/src/routes/atproto.ts`
- `backend/src/server.ts`

## Deployment Notes

1. **Database Migration Required:**
   ```bash
   npx prisma migrate deploy
   ```

2. **Environment Variables:** No new env vars required

3. **Nginx Configuration:** See `STANDARD_SITE_IMPLEMENTATION.md` for proxy setup

4. **Breaking Changes:** None! Feature is opt-in and backward compatible

## Community Alignment

This implementation addresses feedback from GitHub issue #64:

Bridge-first approach (as discussed)
Backward compatible (no breaking changes)
Dual posting is optional
`.well-known` handled by bridge with reverse proxy
Ghost metadata automatically fetched
Opt-in feature with user control

## Questions/Discussion

1. **Icon upload:** Should we implement blob upload for publication icons, or just use URLs from Ghost?

2. **Old post migration:** Should migration be:
   - Bulk "migrate all" button?
   - Per-post "migrate this post" button?
   - Something else?

3. **Frontend location:** Where should standard.site settings live?
   - Separate "Standard.site" section in settings?
   - Under existing "Bluesky" settings?
   - Under "Advanced" settings?

---

**Status:** Backend implementation complete and ready for testing. Frontend UI needed before production release.
