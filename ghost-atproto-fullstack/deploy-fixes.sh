#!/bin/bash

# Deploy crypto.randomUUID and static asset fixes to server
# Run this script to deploy all fixes to your server

set -e

echo "🚀 Deploying fixes to server 204.236.176.29..."

# Check if we have the SSH key
if [ ! -f "ghostsky.pem" ]; then
    echo "❌ SSH key ghostsky.pem not found"
    echo "Please make sure you're in the project root directory"
    exit 1
fi

echo "📋 Step 1: Connecting to server and pulling latest changes..."
ssh -i ghostsky.pem ubuntu@204.236.176.29 << 'EOF'
set -e

echo "🔧 Updating project..."
cd ~/ghost-atproto/ghost-atproto-fullstack

echo "📥 Pulling latest changes..."
git pull origin main

echo "📦 Installing frontend dependencies..."
cd frontend
npm ci

echo "🏗️ Building frontend..."
npm run build

echo "🔄 Restarting frontend service..."
pm2 restart atproto-frontend

echo "✅ Frontend deployment complete!"
EOF

echo "📋 Step 2: Updating nginx configuration..."
ssh -i ghostsky.pem ubuntu@204.236.176.29 << 'EOF'
set -e

echo "⚙️ Updating nginx configuration..."
cd ~/ghost-atproto/ghost-atproto-fullstack

# Backup current nginx config
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)

# Deploy enhanced nginx config
sudo cp backend/nginx-bridge-enhanced.conf /etc/nginx/sites-available/default

echo "🧪 Testing nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration test passed"
    echo "🔄 Reloading nginx..."
    sudo systemctl reload nginx
    echo "✅ Nginx configuration updated!"
else
    echo "❌ Nginx configuration test failed"
    echo "Restoring backup..."
    sudo cp /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S) /etc/nginx/sites-available/default
    exit 1
fi
EOF

echo "📋 Step 3: Verifying deployment..."
ssh -i ghostsky.pem ubuntu@204.236.176.29 << 'EOF'
echo "🔍 Checking services..."
pm2 list

echo "📊 Checking logs..."
pm2 logs atproto-frontend --lines 5

echo "🌐 Checking nginx status..."
sudo systemctl status nginx --no-pager -l
EOF

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "🔍 Test your application at: http://204.236.176.29/bridge/login"
echo ""
echo "✅ What should be fixed:"
echo "  - No more crypto.randomUUID errors"
echo "  - Static assets should load properly (no 400 errors)"
echo "  - CSS, JS, and font files should load"
echo ""
echo "🆘 If issues persist, check:"
echo "  - pm2 logs atproto-frontend"
echo "  - sudo tail -f /var/log/nginx/error.log"
