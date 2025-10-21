# Quick Manual Deployment Guide

## 🚀 Deploy Fixes to Server 204.236.176.29

### Option 1: Automated Script
```bash
cd /Users/sahdasamier/Desktop/ghost-atproto/ghost-atproto-fullstack
./deploy-fixes.sh
```

### Option 2: Manual Commands

#### Step 1: Connect and Update Frontend
```bash
ssh -i ghostsky.pem ubuntu@204.236.176.29
cd ~/ghost-atproto/ghost-atproto-fullstack
git pull origin main
cd frontend
npm ci
npm run build
pm2 restart atproto-frontend
```

#### Step 2: Update Nginx Configuration
```bash
# Still on the server
cd ~/ghost-atproto/ghost-atproto-fullstack

# Backup current config
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)

# Deploy enhanced config
sudo cp backend/nginx-bridge-enhanced.conf /etc/nginx/sites-available/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

#### Step 3: Verify
```bash
pm2 list
pm2 logs atproto-frontend --lines 10
```

## 🔍 What These Fixes Address

### Current Errors (Before Fix):
- ❌ `crypto.randomUUID is not a function`
- ❌ `GET /bridge/_next/static/chunks/... 400 Bad Request`
- ❌ `GET /bridge/_next/static/media/... 400 Bad Request`

### After Fix:
- ✅ Crypto polyfill prevents randomUUID errors
- ✅ Enhanced nginx config serves static assets properly
- ✅ CSS, JS, fonts load without 400 errors

## 🧪 Test After Deployment

1. **Clear browser cache completely**
2. **Visit**: http://204.236.176.29/bridge/login
3. **Check browser console**: Should see no crypto.randomUUID errors
4. **Check Network tab**: Should see no 400 errors for static assets

## 🆘 Troubleshooting

If issues persist:

```bash
# Check frontend logs
pm2 logs atproto-frontend

# Check nginx logs
sudo tail -f /var/log/nginx/error.log

# Restart everything
pm2 restart all
sudo systemctl reload nginx
```
