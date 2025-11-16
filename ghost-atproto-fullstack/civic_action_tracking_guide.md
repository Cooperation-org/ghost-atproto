# Embed and View Tracking Implementation Summary

## ✅ Completed Features

### 1. Database Schema Changes

- Added `embedCount` (INT, default: 0) to track how many times an action is embedded
- Added `embed_count` column in database (snake_case for MySQL)
- Added `viewCount` (INT, default: 0) to track how many times an action is viewed
- Added `view_count` column in database (snake_case for MySQL)
- Schema pushed to database successfully

### 2. Backend API Endpoints

#### POST `/api/civic-actions/:id/track-embed`

- Tracks when an author embeds a civic action in an article
- Accepts optional `authorId` in request body
- Returns updated `embedCount` and `viewCount`
- Public endpoint (no authentication required)

#### POST `/api/civic-actions/:id/track-view`

- Tracks when a user views a civic action
- Returns updated `embedCount` and `viewCount`
- Public endpoint (no authentication required)

### 3. Frontend Integration

#### API Client Methods

- `api.trackEmbed(civicActionId, authorId?)` - Track embed
- `api.trackView(civicActionId)` - Track view
- Updated `CivicActionDto` interface to include `embedCount` and `viewCount`

#### Automatic View Tracking

- Views are automatically tracked when users visit `/dashboard/civic-actions/[id]`
- Tracking happens after the page loads successfully
- Non-blocking (failures don't break the UI)

#### UI Display

- Embed count displayed in detail page: "Embedded in Articles: X articles"
- View count displayed in detail page: "Total Views: X views"
- Counts shown in Event Details sidebar with icons

## 🔧 Setup Required

### 1. Regenerate Prisma Client

**Important**: After the schema changes, you need to regenerate the Prisma client:

```bash
cd ghost-atproto-fullstack/backend
npx prisma generate
```

If you get a file locking error on Windows:

1. Stop your backend server
2. Run `npx prisma generate` again
3. Restart your backend server

### 2. Restart Backend Server

After regenerating Prisma client, restart your backend:

```bash
cd ghost-atproto-fullstack/backend
npm run dev
```

## 📝 How to Use

### For Authors (Embedding Actions)

When you embed a civic action in an article, call:

```typescript
import { api } from '@/lib/api';

// Track embed when action is embedded
await api.trackEmbed(civicActionId, authorId);
```

### For Users (Viewing Actions)

View tracking happens automatically - no code needed!

### Viewing Counts

Counts are displayed on the civic action detail page:

- Navigate to `/dashboard/civic-actions/[id]`
- See "Embedded in Articles" and "Total Views" in the Event Details sidebar

## 🧪 Testing

### Test View Tracking

1. Start your backend and frontend servers
2. Navigate to a civic action detail page
3. Refresh the page multiple times
4. Check the "Total Views" count - it should increment each time

### Test Embed Tracking

**Using curl:**

```bash
curl -X POST http://localhost:5000/api/civic-actions/[action-id]/track-embed \
  -H "Content-Type: application/json" \
  -d '{"authorId": "optional-author-id"}'
```

**Using the API client:**

```typescript
await api.trackEmbed('civic-action-id', 'author-id');
```

### Verify in Database

```sql
SELECT id, title, embed_count, view_count
FROM civic_actions
WHERE id = '[your-action-id]';
```

## 📊 API Response Examples

### Track Embed Response

```json
{
  "success": true,
  "embedCount": 5,
  "viewCount": 120
}
```

### Track View Response

```json
{
  "success": true,
  "embedCount": 5,
  "viewCount": 121
}
```

### Civic Action Response (includes counts)

```json
{
  "id": "abc123",
  "title": "Community Meeting",
  "embedCount": 3,
  "viewCount": 45,
  ...
}
```

## 🐛 Troubleshooting

### TypeScript Errors About embedCount/viewCount

**Problem**: TypeScript says `embedCount` doesn't exist on type.

**Solution**: Regenerate Prisma client:

```bash
cd backend
npx prisma generate
```

### Counts Not Updating

1. Check backend logs for errors
2. Verify the database columns exist:

   ```sql
   DESCRIBE civic_actions;
   ```

   Should show `embed_count` and `view_count` columns

3. Check network tab in browser - verify API calls are succeeding

### File Locking Error on Windows

If `prisma generate` fails with "operation not permitted":

1. Stop all Node.js processes
2. Close your IDE/editor
3. Run `npx prisma generate` from command prompt
4. Restart your IDE and servers

## 📚 Files Modified

### Backend

- `backend/prisma/schema.prisma` - Added embedCount and viewCount fields
- `backend/src/server.ts` - Added tracking endpoints

### Frontend

- `frontend/src/lib/api.ts` - Added tracking methods and updated types
- `frontend/src/app/dashboard/civic-actions/[id]/page.tsx` - Added view tracking and UI display

## 🎯 Next Steps

1. **Regenerate Prisma Client** (required)
2. **Restart Backend Server** (required)
3. **Test the tracking** using the methods above
4. **Integrate embed tracking** in your article embedding code

## 📖 Additional Documentation

See `TRACKING_FEATURE_GUIDE.md` for detailed usage instructions and examples.
