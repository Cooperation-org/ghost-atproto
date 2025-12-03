# Installation Guide for Ghost Server Operators

This guide helps you install and configure the Ghost Bluesky Comments Shim on your Ghost server.

## What This Does

The Ghost Comments Shim allows Bluesky replies to appear as native comments on your Ghost blog posts. When someone replies to your Bluesky post, their comment automatically syncs to your Ghost site.

## Prerequisites

Before installing, ensure you have:

### Required

- **Ghost**: Self-hosted Ghost instance (v4.0+)
- **Node.js**: Version 18 or higher
- **npm**: Comes with Node.js
- **Database Access**: MySQL or SQLite credentials for your Ghost database
- **System Access**: Root/sudo privileges on your server

### Optional but Recommended

- **systemd**: For running the shim as a system service (included in most Linux distributions)
- **nginx or Apache**: For reverse proxy (if exposing externally)

### Check Your System

```bash
# Check Node.js version (must be 18+)
node -v

# Check npm
npm -v

# Check if you have sudo access
sudo echo "Access granted"

# Check if Ghost is running
systemctl status ghost
```

## Installation Methods

Choose one of the following methods:

### Method 1: Automated Installation (Recommended)

The automated installer handles everything for you.

1. **Download the installer:**
   ```bash
   curl -o install.sh https://raw.githubusercontent.com/your-org/ghost-atproto/main/ghost-comments-shim/install.sh
   chmod +x install.sh
   ```

2. **Run the installer:**
   ```bash
   sudo ./install.sh
   ```

3. **Follow the prompts** to configure:
   - Database type (MySQL or SQLite)
   - Database connection details
   - Bluesky member ID (you'll create this in Ghost Admin)
   - Port number (default: 3001)

4. **Save the shared secret** displayed at the end - you'll need it for the bridge configuration

That's it! Skip to [Verify Installation](#verify-installation).

### Method 2: Manual Installation

If you prefer manual control or the automated installer doesn't work:

#### Step 1: Install via npm

```bash
# Create installation directory
sudo mkdir -p /opt/ghost-comments-shim
cd /opt/ghost-comments-shim

# Install the package
sudo npm install @ghost-atproto/comments-shim --production
```

#### Step 2: Create Bluesky Member in Ghost

Before configuring, create a special member in Ghost Admin:

1. Go to **Ghost Admin** → **Members** → **New Member**
2. Fill in:
   - **Email**: `comments@bsky.atproto.invalid`
   - **Name**: `Bluesky`
   - **Note**: `Bridged comments from Bluesky/ATProto`
   - **Subscribed**: Unchecked
   - **Labels**: Add label `bluesky-bridge`
3. **Save** the member
4. **Copy the Member ID** from the browser URL bar:
   - URL looks like: `.../ghost/#/members/64abc123def456789...`
   - Copy the 24-character hex ID: `64abc123def456789...`

#### Step 3: Configure Environment

```bash
# Copy example environment file
cp node_modules/@ghost-atproto/comments-shim/.env.example .env

# Edit configuration
sudo nano .env
```

**For MySQL:**
```env
GHOST_DB_TYPE=mysql
GHOST_DB_CONNECTION=mysql://ghost:your_password@localhost:3306/ghost_production
BRIDGE_SHARED_SECRET=generate-a-long-random-secret-32-chars-minimum
BLUESKY_MEMBER_ID=64abc123def456789...
PORT=3001
```

**For SQLite:**
```env
GHOST_DB_TYPE=sqlite
GHOST_DB_CONNECTION=/var/www/ghost/content/data/ghost.db
BRIDGE_SHARED_SECRET=generate-a-long-random-secret-32-chars-minimum
BLUESKY_MEMBER_ID=64abc123def456789...
PORT=3001
```

**Generate a secure shared secret:**
```bash
openssl rand -base64 32
```

**Set secure permissions:**
```bash
sudo chmod 600 .env
sudo chown ghost:ghost .env
```

#### Step 4: Create Systemd Service

```bash
sudo nano /etc/systemd/system/ghost-comments-shim.service
```

Add this content (adjust paths if needed):

```ini
[Unit]
Description=Ghost Bluesky Comments Shim
Documentation=https://github.com/your-org/ghost-atproto
After=network.target

[Service]
Type=simple
User=ghost
WorkingDirectory=/opt/ghost-comments-shim
ExecStart=/usr/bin/node /opt/ghost-comments-shim/node_modules/@ghost-atproto/comments-shim/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ghost-comments-shim

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/ghost-comments-shim

# Environment
Environment=NODE_ENV=production
EnvironmentFile=/opt/ghost-comments-shim/.env

[Install]
WantedBy=multi-user.target
```

#### Step 5: Set Permissions

```bash
sudo chown -R ghost:ghost /opt/ghost-comments-shim
sudo chmod -R 750 /opt/ghost-comments-shim
```

#### Step 6: Start the Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable ghost-comments-shim

# Start the service
sudo systemctl start ghost-comments-shim

# Check status
sudo systemctl status ghost-comments-shim
```

## Verify Installation

### Check Service Status

```bash
systemctl status ghost-comments-shim
```

You should see `active (running)` in green.

### Test Health Endpoint

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{"status":"ok"}
```

### Check Logs

```bash
# View recent logs
sudo journalctl -u ghost-comments-shim -n 50

# Follow logs in real-time
sudo journalctl -u ghost-comments-shim -f
```

## Configure the Bridge

The shim alone doesn't sync comments - you also need to configure the central bridge.

### Add to Bridge `.env`

Add these lines to your bridge backend's `.env` file:

```env
SHIM_URL=http://localhost:3001
SHIM_SHARED_SECRET=your-shared-secret-from-shim-env
```

**Important:** The `SHIM_SHARED_SECRET` must match the `BRIDGE_SHARED_SECRET` in the shim's `.env`.

### Configure Bridge for Your Ghost Site

1. Log into the bridge admin dashboard
2. Go to **Settings** → **Ghost Configuration**
3. Enter your Ghost Admin API key
4. The bridge will verify it can reach both Ghost and the shim

## Troubleshooting

### Service Won't Start

**Check logs:**
```bash
sudo journalctl -u ghost-comments-shim -n 100 --no-pager
```

**Common causes:**
- Invalid database credentials
- Database not accessible
- Port already in use
- Incorrect file permissions

### Database Connection Errors

**MySQL:**
```bash
# Test MySQL connection
mysql -h localhost -u ghost -p ghost_production

# Grant permissions if needed
GRANT INSERT ON ghost_production.comments TO 'ghost'@'localhost';
FLUSH PRIVILEGES;
```

**SQLite:**
```bash
# Check file exists and is readable
ls -l /var/www/ghost/content/data/ghost.db

# Fix permissions if needed
sudo chown ghost:ghost /var/www/ghost/content/data/ghost.db
sudo chmod 660 /var/www/ghost/content/data/ghost.db
```

### Port Already in Use

```bash
# Check what's using port 3001
sudo lsof -i :3001

# Change port in .env file
sudo nano /opt/ghost-comments-shim/.env
# Update PORT=3002

# Restart service
sudo systemctl restart ghost-comments-shim
```

### Comments Not Appearing

1. **Check shim is running:**
   ```bash
   systemctl status ghost-comments-shim
   ```

2. **Verify Bluesky member exists:**
   ```bash
   # Check Ghost Admin → Members for "Bluesky" member
   ```

3. **Check bridge connection:**
   ```bash
   curl http://localhost:3001/health
   ```

4. **Review logs:**
   ```bash
   sudo journalctl -u ghost-comments-shim -f
   ```

5. **Test manually:** See [Manual Testing](#manual-testing) below

### Permission Denied Errors

```bash
# Fix ownership
sudo chown -R ghost:ghost /opt/ghost-comments-shim

# Fix file permissions
sudo chmod 750 /opt/ghost-comments-shim
sudo chmod 600 /opt/ghost-comments-shim/.env
```

## Manual Testing

To test the shim is working correctly:

```bash
# 1. Get a test Ghost post ID
# Look in Ghost Admin → Posts, copy a post ID

# 2. Send a test comment
curl -X POST http://localhost:3001/comments \
  -H "Authorization: Bearer your-shared-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "post_id": "your-ghost-post-id",
    "bsky_handle": "test.bsky.social",
    "bsky_profile_url": "https://bsky.app/profile/test.bsky.social",
    "bsky_post_url": "https://bsky.app/profile/test.bsky.social/post/test123",
    "comment_text": "This is a test comment",
    "parent_comment_id": null,
    "created_at": "2025-01-15T12:00:00Z"
  }'
```

Expected response:
```json
{"comment_id":"507f1f77bcf86cd799439012"}
```

Check Ghost Admin → Your Post → Comments to see the test comment.

## Upgrading

### From npm

```bash
cd /opt/ghost-comments-shim
sudo npm update @ghost-atproto/comments-shim
sudo systemctl restart ghost-comments-shim
```

### Check Version

```bash
npm list @ghost-atproto/comments-shim
```

## Uninstallation

If you need to remove the shim:

```bash
# Stop and disable service
sudo systemctl stop ghost-comments-shim
sudo systemctl disable ghost-comments-shim

# Remove service file
sudo rm /etc/systemd/system/ghost-comments-shim.service
sudo systemctl daemon-reload

# Remove installation
sudo rm -rf /opt/ghost-comments-shim

# Optional: Remove Bluesky member from Ghost Admin
```

## Security Best Practices

1. **Use Strong Secrets**: Generate secrets with `openssl rand -base64 32`
2. **Restrict Network Access**: Only allow bridge to access shim
3. **Keep Updated**: Regularly update with `npm update`
4. **Monitor Logs**: Set up log monitoring for errors
5. **Backup Configuration**: Keep `.env` backed up securely
6. **Use Firewall**: Block port 3001 from external access

## Advanced Configuration

### Using nginx Reverse Proxy

If you want to access the shim through nginx:

```nginx
upstream ghost-comments-shim {
    server 127.0.0.1:3001;
}

server {
    listen 443 ssl http2;
    server_name shim.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://ghost-comments-shim;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Running Multiple Instances

If you run multiple Ghost sites:

1. Install separate shim instances in different directories
2. Use different ports for each (3001, 3002, etc.)
3. Create separate systemd services
4. Use different member IDs for each Ghost site

### Custom Installation Directory

To use a different directory:

```bash
INSTALL_DIR=/var/www/ghost-comments-shim
sudo mkdir -p $INSTALL_DIR
cd $INSTALL_DIR
# Continue with installation steps...
```

Update the systemd service file paths accordingly.

## Getting Help

- **Documentation**: Check README.md in the installation directory
- **Logs**: Always check logs first: `journalctl -u ghost-comments-shim -f`
- **GitHub Issues**: Report bugs at https://github.com/your-org/ghost-atproto/issues
- **Community**: Join discussions in the repository

## Related Documentation

- [PUBLISH.md](PUBLISH.md) - For maintainers publishing to npm
- [README.md](README.md) - Technical documentation
- [Bridge Setup Guide](../ghost-atproto-fullstack/backend/COMMENT_SYNC_SETUP.md) - Full system setup
