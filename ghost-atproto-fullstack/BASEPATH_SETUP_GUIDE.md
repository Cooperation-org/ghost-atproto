# Base Path Configuration Guide

## Overview
This application can work with or without a base path prefix (like `/bridge`). This guide explains how to configure it for different environments.

## Environment Configuration

### Local Development (Without /bridge)

1. Create `.env.local` in the `frontend` directory:
```bash
cd ghost-atproto-fullstack/frontend
cat > .env.local << 'EOF'
# Local Development Environment Variables
# No base path for local development
NEXT_PUBLIC_BASE_PATH=
NEXT_PUBLIC_API_URL=http://127.0.0.1:5001
EOF
```

2. Run the application:
```bash
npm run dev
```

3. Access at: `http://localhost:3000`

### Production Deployment (With /bridge)

1. Create `.env.production` in the `frontend` directory on your server:
```bash
cd ~/ghost-atproto/ghost-atproto-fullstack/frontend
cat > .env.production << 'EOF'
# Production Environment Variables (Server Deployment)
# Use /bridge base path for production
NEXT_PUBLIC_BASE_PATH=/bridge
NEXT_PUBLIC_API_URL=http://127.0.0.1:5001
EOF
```

2. Build the application:
```bash
npm run build
```

3. Access at: `http://204.236.176.29/bridge`

## How It Works

### Next.js Configuration
The `next.config.ts` file now reads the `NEXT_PUBLIC_BASE_PATH` environment variable:
```typescript
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const nextConfig: NextConfig = {
  basePath: basePath,
  assetPrefix: basePath || undefined,
  // ...
};
```

### Navigation
All navigation now uses Next.js router which automatically handles the basePath:
```typescript
import { useRouter } from 'next/navigation';
const router = useRouter();
router.push('/dashboard/civic-actions/123'); // Automatically becomes /bridge/dashboard/civic-actions/123 in production
```

### API Calls
The API client uses the configured API URL from environment variables.

## Quick Setup Commands

### For Local Development
```bash
# In ghost-atproto-fullstack/frontend/
echo "NEXT_PUBLIC_BASE_PATH=" > .env.local
echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:5001" >> .env.local
npm run dev
```

### For Server Deployment
```bash
# SSH into your server
ssh -i ghostsky.pem ubuntu@204.236.176.29

# Navigate to frontend directory
cd ~/ghost-atproto/ghost-atproto-fullstack/frontend

# Create production environment file
cat > .env.production << 'EOF'
NEXT_PUBLIC_BASE_PATH=/bridge
NEXT_PUBLIC_API_URL=http://127.0.0.1:5001
EOF

# Pull latest changes
git pull origin main

# Install dependencies and build
npm ci
npm run build

# Restart the frontend service
pm2 restart atproto-frontend
```

## Verification

### Check Current Configuration
```bash
# In the frontend directory
cat .env.local      # For local
cat .env.production # For production
```

### Test Navigation
- Local: http://localhost:3000/dashboard/civic-actions
- Production: http://204.236.176.29/bridge/dashboard/civic-actions

All links should work correctly with or without the `/bridge` prefix based on your environment configuration.

## Troubleshooting

### Issue: 404 errors on production
**Solution**: Ensure `.env.production` exists and contains `NEXT_PUBLIC_BASE_PATH=/bridge`

### Issue: Assets not loading
**Solution**: 
1. Check nginx configuration includes the correct proxy rules
2. Verify `.env.production` has the correct base path
3. Rebuild the application: `npm run build`

### Issue: Navigation broken
**Solution**: Make sure you're using Next.js router (`useRouter` from `next/navigation`) instead of `window.location.href`

## Environment Variables Reference

| Variable | Local Value | Production Value | Description |
|----------|-------------|------------------|-------------|
| `NEXT_PUBLIC_BASE_PATH` | `` (empty) | `/bridge` | Base path prefix for all routes |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:5001` | `http://127.0.0.1:5001` | Backend API URL |

## Migration from Old Setup

If you're migrating from the old hardcoded `/bridge` setup:

1. **Create environment files** as described above
2. **Rebuild the application**: `npm run build`
3. **Restart services**: `pm2 restart atproto-frontend`
4. **Test all navigation**: Verify civic actions detail pages work correctly

## Notes

- The `.env.local` and `.env.production` files are gitignored and won't be committed
- Environment variables starting with `NEXT_PUBLIC_` are embedded in the client-side bundle at build time
- Changes to environment variables require a rebuild (`npm run build`)
- Development mode (`npm run dev`) uses `.env.local` and supports hot reloading

