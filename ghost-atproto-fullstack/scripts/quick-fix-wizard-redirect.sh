#!/bin/bash

# Quick fix for wizard redirect issue
# This script can be run directly on the server to fix the nginx configuration

echo "🔧 Quick fix for wizard redirect issue..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Backup current config
echo "📋 Backing up current nginx configuration..."
cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)

# Create the correct nginx configuration
echo "⚙️  Creating correct nginx configuration..."
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
        echo "🎉 Fix applied successfully!"
        echo ""
        echo "Testing the fix..."
        echo "curl -I http://204.236.176.29/wizard/"
        curl -I http://204.236.176.29/wizard/
        echo ""
        echo "curl -I http://204.236.176.29/wizard"
        curl -I http://204.236.176.29/wizard
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
