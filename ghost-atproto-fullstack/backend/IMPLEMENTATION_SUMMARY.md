# Implementation Summary: Phases 2-4

All code changes for Phases 2, 3, and 4 have been completed. Migrations will need to be run on the server when deployed.

## Phase 2: Virtual Events Support ✅

### Changes Made:

1. **Schema (`prisma/schema.prisma`)**
   - Added `isVirtual Boolean?` field to `CivicAction` model (line 118)
   - Added index on `isVirtual` field (line 146)
   - Allows filtering and searching for virtual vs in-person events

2. **Mobilize Sync Job (`src/jobs/sync-mobilize.ts`)**
   - Updated upsert operations to populate `isVirtual` from Mobilize API (lines 225, 243)
   - Extracts `event.is_virtual` from API and stores in dedicated column
   - Kept in `sourceMeta` JSON for backward compatibility

### Migration Required:
```bash
npx prisma migrate dev --name add_is_virtual_field
```

---

## Phase 3: Soft Delete for Expired Events ✅

### Changes Made:

1. **Schema (`prisma/schema.prisma`)**
   - Added `deletedAt DateTime?` field to `CivicAction` model (line 118)
   - Added index on `deletedAt` field (line 147)
   - Allows marking events as deleted without removing from database

2. **Mobilize Sync Job (`src/jobs/sync-mobilize.ts`)**
   - Added logic to soft-delete events with no upcoming timeslots (lines 173-194)
   - Events with `deletedAt` are hidden from users
   - Events are "undeleted" (deletedAt set to null) if they get new timeslots (line 226)
   - This handles the ~500 events/day from Mobilize gracefully

3. **Server API (`src/server.ts`)**
   - Updated public civic actions endpoint to filter `deletedAt IS NULL` (line 1560)
   - Ensures soft-deleted events don't appear in searches or lists

### Migration Required:
```bash
npx prisma migrate dev --name add_soft_delete
```

---

## Phase 4: Admin Prioritization System ✅

### Changes Made:

1. **Schema (`prisma/schema.prisma`)**
   - Added `priority Int @default(0)` field to `CivicAction` model (line 119)
   - Added `recommendedBy String?` field to `CivicAction` model (line 120)
   - Added `recommendedCivicActions` relation to `User` model (line 27)
   - Added `recommender` relation to `CivicAction` model (line 136)
   - Added indexes on both new fields (lines 142, 148)

2. **Server API (`src/server.ts`)**

   **New Admin Endpoints:**
   - `POST /api/civic-actions/:id/recommend` (lines 2005-2037)
     - Marks civic action as recommended by current admin
     - Sets `recommendedBy` to admin's user ID
     - Returns civic action with recommender details

   - `POST /api/civic-actions/:id/set-priority` (lines 2039-2065)
     - Allows admins to set priority (0-100) for civic actions
     - Validates priority is number between 0 and 100
     - Higher priority = appears first in lists

   **Updated Sorting:**
   - Public civic actions endpoint (line 1639): `[isPinned DESC, priority DESC, eventDate ASC, createdAt DESC]`
   - Authenticated civic actions endpoint (line 1776): `[isPinned DESC, priority DESC, createdAt DESC]`
   - Ensures high-priority and recommended actions appear first

### Migration Required:
```bash
npx prisma migrate dev --name add_admin_prioritization
```

---

## Summary of All Files Modified

1. **`backend/prisma/schema.prisma`**
   - Added `isVirtual`, `deletedAt`, `priority`, `recommendedBy` fields
   - Added corresponding indexes
   - Added `RecommendedActions` relation to User model

2. **`backend/src/jobs/sync-mobilize.ts`**
   - Populates `isVirtual` from Mobilize API
   - Soft-deletes events with no upcoming timeslots
   - Undeletes events if they get new timeslots

3. **`backend/src/server.ts`**
   - Filters `deletedAt IS NULL` in public queries
   - Added `/api/civic-actions/:id/recommend` endpoint
   - Added `/api/civic-actions/:id/set-priority` endpoint
   - Updated sorting to include `priority DESC` in both public and authenticated endpoints

4. **`backend/.env`** (created)
   - Created environment configuration file
   - Note: Contains placeholder values, update for production

5. **`frontend/src/app/dashboard/civic-actions/page.tsx`** (Phase 1)
   - Made cards clickable to copy JSON to clipboard
   - Removed disabled "Add to Article" button

---

## Next Steps (On Server Deployment)

1. **Run migrations in order:**
   ```bash
   cd backend
   npx prisma migrate dev --name add_is_virtual_field
   npx prisma migrate dev --name add_soft_delete
   npx prisma migrate dev --name add_admin_prioritization
   ```

2. **Run initial sync** to populate new fields for existing events:
   ```bash
   # Use admin account to trigger sync via API
   POST /api/admin/sync-mobilize
   ```

3. **Test admin features:**
   - Recommend civic actions via: `POST /api/civic-actions/:id/recommend`
   - Set priority via: `POST /api/civic-actions/:id/set-priority`
   - Verify sorting shows high-priority items first

4. **Monitor soft-delete:**
   - Check logs for events being soft-deleted
   - Verify soft-deleted events don't appear in public API
   - Confirm events are undeleted if they get new timeslots

---

## API Endpoints Reference

### Admin-Only Endpoints

**Recommend Civic Action:**
```http
POST /api/civic-actions/:id/recommend
Authorization: Bearer {token}

Response:
{
  "id": "...",
  "recommendedBy": "admin-user-id",
  "recommender": {
    "id": "admin-user-id",
    "name": "Admin Name",
    "email": "admin@example.com"
  },
  ...
}
```

**Set Priority:**
```http
POST /api/civic-actions/:id/set-priority
Authorization: Bearer {token}
Content-Type: application/json

{
  "priority": 75
}

Response:
{
  "id": "...",
  "priority": 75,
  ...
}
```

**Manual Mobilize Sync:**
```http
POST /api/admin/sync-mobilize
Authorization: Bearer {token}
Content-Type: application/json

{
  "organizationIds": [93],
  "updatedSince": 1699999999
}

Response:
{
  "message": "Mobilize sync completed",
  "result": {
    "synced": 150,
    "skipped": 50,
    "errors": 0
  }
}
```

---

## Database Schema Changes

### CivicAction Model - New Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `isVirtual` | Boolean? | null | Whether event is virtual/online |
| `deletedAt` | DateTime? | null | Soft-delete timestamp for expired events |
| `priority` | Int | 0 | Admin-assigned priority (0-100, higher = more important) |
| `recommendedBy` | String? | null | User ID of admin who recommended this action |

### New Indexes

- `@@index([isVirtual])` - Fast filtering for virtual events
- `@@index([deletedAt])` - Fast filtering for non-deleted events
- `@@index([priority])` - Fast sorting by priority
- `@@index([recommendedBy])` - Fast lookup of recommended events

---

## Scheduler Configuration

The existing daily scheduler (`src/jobs/scheduler.ts`) automatically runs the Mobilize sync job at 2:00 AM daily, which now includes:
- Populating `isVirtual` field
- Soft-deleting expired events
- Undeleting events with new timeslots

No scheduler changes needed.
