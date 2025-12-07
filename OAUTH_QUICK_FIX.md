# Quick OAuth Fix Summary

## Files Changed

### Backend
- `package.json` - Updated dependencies (removed bcryptjs, added simple-store)  
- `src/lib/oauth-atproto.ts` - NEW: Proper ATProto OAuth implementation
- `src/routes/oauth.ts` - NEW: Fixed OAuth routes for both Google and ATProto
- `prisma/schema.prisma` - Updated: email optional, added OAuth tables, removed password
- `public/client-metadata.json` - Fixed redirect URI
- `.env.example` - NEW: Proper environment variables

### Frontend
- `src/app/login/page.tsx` - NEW: Dual login page (Google + Bluesky)
- `src/app/welcome/email/page.tsx` - NEW: Optional email collection for Bluesky users

## Quick Setup

```bash
# 1. Update dependencies
cd backend
yarn install

# 2. Update database
npx prisma db push

# 3. Set environment (MUST use 127.0.0.1 not localhost)
cp .env.example .env
# Edit .env - set APP_URL="http://127.0.0.1:5000"

# 4. Run servers
yarn dev
```

## Key Changes

✅ **Both Google OAuth and Bluesky/ATProto OAuth supported**
✅ **No password storage** - OAuth only
✅ **Email optional** for Bluesky users (can skip or provide for newsletter)
✅ **Persistent sessions** in database (survives server restart)
✅ **Proper DPoP tokens** as per ATProto spec

## Login Flow

**Google Users:**
1. Click Google button → Authorize → Dashboard

**Bluesky Users:**
1. Enter handle → Authorize → Optional email → Dashboard

## Critical Notes

⚠️ **MUST use `127.0.0.1` not `localhost` in development**
⚠️ **MUST use HTTPS in production**
⚠️ **Delete the old `bluesky-oauth.ts` file** - it's completely wrong
⚠️ **Run database migration** to add OAuth tables
