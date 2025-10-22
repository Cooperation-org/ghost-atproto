#!/bin/bash

# Deploy enhanced nginx configuration for Ghost ATProto Bridge
# This script fixes static asset serving issues

set -e

echo "🚀 Deploying enhanced nginx configuration..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Backup current nginx config
echo "📋 Backing up current nginx configuration..."
cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)

# Update nginx configuration with enhanced static asset handling
echo "⚙️  Updating nginx configuration with enhanced static asset handling..."
cat > /etc/nginx/sites-available/default << 'EOF'
# Enhanced nginx config for Ghost ATProto Bridge
# Handles Next.js static assets properly

server {
    listen 80;
    server_name _;

    # Handle wizard redirects FIRST (before any other location blocks)
    location ~ ^/wizard/?$ {
        return 301 /bridge/wizard;
    }

    # Next.js static assets - handle _next/static paths
    location /bridge/_next/static/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Cache static assets
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Next.js static files (images, etc.)
    location /bridge/_next/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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
        
        # Handle Next.js routing
        proxy_redirect off;
    }

    # Backend API - Express (port 5000) already serves /api and /bridge/api
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
    
    echo "✅ Enhanced nginx configuration deployed successfully!"
    echo ""
    echo "🔧 Changes made:"
    echo "  - Added specific handling for /bridge/_next/static/ paths"
    echo "  - Added caching headers for static assets"
    echo "  - Improved proxy configuration for Next.js"
    echo "  - Added proxy_redirect off for better routing"
    echo ""
    echo "📝 Next steps:"
    echo "  1. Restart your Next.js frontend: pm2 restart atproto-frontend"
    echo "  2. Clear browser cache and test the application"
    echo "  3. Check browser console for any remaining errors"
else
    echo "❌ Nginx configuration test failed"
    echo "Restoring backup configuration..."
    cp /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S) /etc/nginx/sites-available/default
    exit 1
fi
