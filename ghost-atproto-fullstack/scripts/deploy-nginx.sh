#!/bin/bash

# Deploy nginx configuration for Ghost ATProto Bridge
# This script updates the nginx configuration to fix wizard redirects

set -e

echo "🚀 Deploying nginx configuration..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Backup current nginx config
echo "📋 Backing up current nginx configuration..."
cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)

# Update nginx configuration
echo "⚙️  Updating nginx configuration..."
cat > /etc/nginx/sites-available/default << 'EOF'
# Simple nginx config for Ghost ATProto Bridge

server {
    listen 80;
    server_name _;

    # Handle wizard redirects FIRST (before any other location blocks)
    location ~ ^/wizard/?$ {
        return 301 /bridge/wizard;
    }

    # Frontend - Next.js (port 3000) - serves at /bridge
    location /bridge {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API - Express (port 5000) already serves /api and /bridge/api
    # Just proxy everything on port 5000 as-is
    location ~ ^/(api|bridge/api)/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration test passed"
    
    # Reload nginx
    echo "🔄 Reloading nginx..."
    systemctl reload nginx
    
    if [ $? -eq 0 ]; then
        echo "✅ Nginx reloaded successfully"
        echo ""
        echo "🎉 Deployment complete!"
        echo ""
        echo "Test the redirect:"
        echo "  curl -I http://204.236.176.29/wizard/"
        echo "  curl -I http://204.236.176.29/wizard"
        echo ""
        echo "Both should redirect to /bridge/wizard"
    else
        echo "❌ Failed to reload nginx"
        exit 1
    fi
else
    echo "❌ Nginx configuration test failed"
    echo "Restoring backup..."
    cp /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S) /etc/nginx/sites-available/default
    exit 1
fi
