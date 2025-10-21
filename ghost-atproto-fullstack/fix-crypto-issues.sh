#!/bin/bash

# Fix crypto.randomUUID and crypto-polyfill.js issues
# This script addresses the 404 error for crypto-polyfill.js and crypto.randomUUID errors

echo "🔧 Fixing crypto.randomUUID and crypto-polyfill.js issues..."

# Check if we're on the server
if [[ "$(hostname)" == *"204.236.176.29"* ]] || [[ "$(pwd)" == *"ghost-atproto"* ]]; then
    echo "📍 Detected server environment"
    
    # Navigate to project directory
    cd ~/ghost-atproto/ghost-atproto-fullstack || {
        echo "❌ Could not navigate to project directory"
        exit 1
    }
    
    # Pull latest changes
    echo "📥 Pulling latest changes..."
    git pull origin main
    
    # Build frontend
    echo "🔨 Building frontend..."
    cd frontend
    npm ci
    npm run build
    
    # Restart frontend service
    echo "🔄 Restarting frontend service..."
    pm2 restart atproto-frontend
    
    # Check service status
    echo "✅ Checking service status..."
    pm2 list
    
    echo "🎉 Crypto issues fix deployed!"
    echo "🌐 Test at: http://204.236.176.29/bridge/login"
    
else
    echo "📍 Detected local environment"
    echo "🔨 Building frontend locally..."
    
    cd frontend
    npm run build
    
    echo "✅ Local build complete!"
    echo "🌐 Test locally at: http://localhost:3000/bridge/login"
fi

echo ""
echo "🔍 What was fixed:"
echo "  ✅ Fixed crypto-polyfill.js 404 error (corrected path to /bridge/crypto-polyfill.js)"
echo "  ✅ Enhanced crypto polyfill with better UUID v4 implementation"
echo "  ✅ Added fallback to crypto.getRandomValues for better randomness"
echo "  ✅ Added proper error handling and logging"
echo ""
echo "🧪 Test in browser console:"
echo "  - Should see: 'crypto.randomUUID polyfill loaded successfully'"
echo "  - Should NOT see: 'crypto.randomUUID is not a function' errors"
echo "  - Should NOT see: 404 errors for crypto-polyfill.js"
