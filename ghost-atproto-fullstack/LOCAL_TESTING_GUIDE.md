# Local Testing and Server Deployment Guide

## 🧪 Local Testing (Current Setup)

Since you're working locally, let's test the fixes first:

### 1. Start the Frontend Locally
```bash
cd /Users/sahdasamier/Desktop/ghost-atproto/ghost-atproto-fullstack/frontend
npm run dev
```

### 2. Test the Crypto Polyfill
- Open your browser to `http://localhost:3000/bridge`
- Open browser console (F12)
- Look for any `crypto.randomUUID` errors
- The polyfill should prevent these errors

### 3. Check Static Assets
- Look for any 404 or 400 errors in Network tab
- Static assets should load properly from `/_next/static/`

## 🚀 Server Deployment (When Ready)

When you're ready to deploy to your actual server, here are the correct commands:

### 1. Deploy Frontend Changes

**SSH into your actual server:**
```bash
# Replace 'your-actual-server' with your real server hostname/IP
ssh your-actual-server

# Navigate to the project directory
cd ~/ghost-atproto/ghost-atproto-fullstack

# Pull the latest changes
git pull origin main

# Install dependencies and build frontend
cd frontend
npm ci
npm run build

# Restart the frontend service
pm2 restart atproto-frontend
```

### 2. Deploy Enhanced Nginx Configuration

**On your server, run as root:**
```bash
# Copy the enhanced nginx config
sudo cp backend/nginx-bridge-enhanced.conf /etc/nginx/sites-available/default

# Test the configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

### 3. Alternative: Use the Deployment Script

**On your server:**
```bash
sudo ./scripts/deploy-enhanced-nginx.sh
```

## 🔍 What to Look For After Deployment

### ✅ Success Indicators:
- No `crypto.randomUUID` errors in browser console
- Static assets load without 400/404 errors
- Application functions normally
- No chunk loading failures

### ❌ If Issues Persist:
1. Check PM2 logs: `pm2 logs atproto-frontend`
2. Check nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Restart services: `pm2 restart all && sudo systemctl reload nginx`

## 📝 Current Status

✅ **Frontend fixes are complete and ready:**
- Crypto polyfill system implemented
- Build successful with no errors
- All ESLint issues resolved
- Enhanced Next.js configuration

🔄 **Next step:** Deploy to your server when ready

## 🆘 Need Help?

If you encounter issues:
1. Check the server logs first
2. Verify the server has the latest code
3. Ensure PM2 and nginx are running
4. Test with a fresh browser session (clear cache)
