# OAuth Implementation Fix Instructions

## What Was Wrong

1. **Incorrect dependency**: Using non-existent `@atproto-labs/simple-store-memory` import
2. **Password storage**: NEVER store passwords, even app passwords - OAuth should handle auth
3. **Wrong OAuth flow**: Trying to use fixed endpoints like traditional OAuth instead of handle-based discovery
4. **Missing DPoP**: Not implementing DPoP-bound tokens as required by atproto
5. **Session storage**: Using in-memory storage that loses sessions on restart

## What I Fixed

### Backend Changes

1. **Updated package.json** (`/backend/package.json`)
   - Removed `bcryptjs` (no password storage)
   - Added `@atproto-labs/simple-store` and `@atproto-labs/simple-store-memory`

2. **New OAuth implementation** (`/backend/src/lib/oauth-atproto.ts`)
   - Proper handle-based OAuth discovery
   - Database-backed session storage using Prisma
   - DPoP token support
   - Session restoration and revocation

3. **Updated routes** (`/backend/src/routes/oauth.ts`)
   - Separate Google OAuth and ATProto OAuth flows
   - Email collection for ATProto users (optional for newsletter)
   - Proper session management with JWT + DID storage
   - Logout with session revocation

4. **Database schema** (`/backend/prisma/schema.prisma`)
   - Made email optional for ATProto users
   - Added OAuthState and OAuthSession tables for persistent storage
   - Added googleId field for Google OAuth
   - Removed password fields for OAuth users
   - Added proper indexes

5. **Client metadata** (`/backend/public/client-metadata.json`)
   - Fixed redirect URI to `/api/auth/callback`
   - Must use `127.0.0.1` not `localhost` for development

### Frontend Changes

1. **Login page** (`/frontend/src/app/login/page.tsx`)
   - Dual login: Google button and Bluesky handle input
   - Proper error handling
   - Clean UI with both options

2. **Email collection** (`/frontend/src/app/welcome/email/page.tsx`)
   - Optional email collection for ATProto users
   - Newsletter opt-in checkbox
   - Skip option for users who don't want to provide email

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend
yarn install
# or npm install
```

### 2. Update Database
```bash
# Run the migration to update schema
cd backend
npx prisma db push

# Or run the SQL migration manually
mysql -u root -p your_database < prisma/migrations/oauth_fix_migration.sql
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your values
```

**IMPORTANT for development:**
- Use `http://127.0.0.1:5000` NOT `http://localhost:5000`
- ATProto OAuth requires IP addresses for loopback

**IMPORTANT for production:**
- Must use HTTPS (e.g., `https://yourdomain.com`)
- Update APP_URL and FRONTEND_URL accordingly

### 4. Google OAuth Setup (Optional)
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add redirect URI: `http://127.0.0.1:5000/api/auth/google/callback` (dev)
4. Add redirect URI: `https://yourdomain.com/api/auth/google/callback` (prod)

### 5. Start Services
```bash
# Terminal 1 - Backend
cd backend
yarn dev

# Terminal 2 - Frontend
cd frontend
yarn dev
```

### 6. Test OAuth Flow

**ATProto/Bluesky:**
1. Go to http://127.0.0.1:3000/login
2. Enter your Bluesky handle (e.g., `yourhandle.bsky.social`)
3. Click "Continue with Bluesky"
4. Authorize on Bluesky
5. Optionally provide email for newsletter
6. Land on dashboard

**Google:**
1. Go to http://127.0.0.1:3000/login
2. Click "Continue with Google"
3. Authorize with Google
4. Land on dashboard

## Key Differences from Original

1. **No Password Storage**: OAuth handles all authentication
2. **Proper Session Management**: Database-backed, persistent sessions
3. **Handle-based Discovery**: ATProto finds the OAuth server from the handle
4. **DPoP Tokens**: Secure, bound tokens as per spec
5. **Email Optional**: ATProto users don't need email to use the platform

## Common Issues

### "Failed to initiate OAuth"
- Check APP_URL is using IP address (127.0.0.1) not localhost
- Ensure client-metadata.json is accessible at APP_URL/client-metadata.json

### "Session expired"
- Normal behavior - OAuth sessions expire
- User needs to log in again

### Google OAuth not working
- Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set
- Verify redirect URI is added in Google Console

## Security Notes

1. **Never store passwords** - Not even "app passwords"
2. **Use HTTPS in production** - Required for ATProto OAuth
3. **Rotate JWT_SECRET** - Use a strong, unique secret in production
4. **Session cleanup** - Old sessions are automatically cleaned by updated_at index

## Next Steps

1. Add session refresh logic (tokens expire)
2. Add rate limiting to OAuth endpoints
3. Add monitoring for failed OAuth attempts
4. Consider adding more OAuth providers (GitHub, Discord, etc.)
