# Quick Deployment Guide - Bridge Path Fix

## 🚀 Deploy to Server (One Command)

```bash
ssh -i ghostsky.pem ubuntu@204.236.176.29 << 'ENDSSH'
cd ~/ghost-atproto/ghost-atproto-fullstack
git pull origin main
cd frontend
cat > .env.production << 'EOF'
NEXT_PUBLIC_BASE_PATH=/bridge
NEXT_PUBLIC_API_URL=http://127.0.0.1:5001
EOF
npm ci
npm run build
pm2 restart atproto-frontend
echo "✅ Deployment complete!"
pm2 list
ENDSSH
```

## 🔍 Quick Test

After deployment, test these URLs:

1. **Dashboard**: http://204.236.176.29/bridge/dashboard
2. **Civic Actions List**: http://204.236.176.29/bridge/dashboard/civic-actions
3. **Civic Action Detail**: Click any action and verify the detail page loads

## ✅ What This Fixes

- ✅ Civic action detail pages now work correctly
- ✅ All navigation respects the `/bridge` prefix
- ✅ Local development works without `/bridge`
- ✅ No more hardcoded paths

## 📋 Verification Checklist

```bash
# On server, verify:
cat ~/ghost-atproto/ghost-atproto-fullstack/frontend/.env.production
# Should show: NEXT_PUBLIC_BASE_PATH=/bridge

pm2 logs atproto-frontend --lines 10
# Should show no errors

# In browser:
# 1. Go to: http://204.236.176.29/bridge/dashboard/civic-actions
# 2. Click on any civic action
# 3. URL should be: http://204.236.176.29/bridge/dashboard/civic-actions/[id]
# 4. Page should load correctly
```

## 🆘 If Issues

```bash
# Check logs
ssh -i ghostsky.pem ubuntu@204.236.176.29
pm2 logs atproto-frontend --lines 50

# Restart everything
pm2 restart all
sudo systemctl reload nginx
```

## 📚 Full Documentation

- **Setup Guide**: `BASEPATH_SETUP_GUIDE.md`
- **Complete Solution**: `BRIDGE_ISSUE_SOLUTION.md`
- **Deployment Guide**: `DEPLOY_TO_204_236_176_29.md`

