# Quick Start Guide

Get the Ghost Bluesky Comments Shim running in 5 minutes.

## TL;DR

```bash
# 1. Download and run installer
curl -fsSL https://raw.githubusercontent.com/Cooperation-org/ghost-atproto/main/ghost-comments-shim/install.sh | sudo bash

# 2. Save the shared secret shown at the end

# 3. Add to your bridge .env:
SHIM_URL=http://localhost:3001
SHIM_SHARED_SECRET=<the-secret-from-step-2>
```

## Prerequisites Checklist

- [ ] Self-hosted Ghost (v4.0+)
- [ ] Node.js 18+ installed (`node -v`)
- [ ] Root/sudo access to your server
- [ ] Ghost database credentials (MySQL or SQLite path)

## Step-by-Step

### 1. Create Bluesky Member in Ghost

**Before running the installer**, create a special member in Ghost Admin:

1. **Ghost Admin** → **Members** → **New Member**
2. Fill in:
   - Email: `comments@bsky.atproto.invalid`
   - Name: `Bluesky`
   - Subscribed: ❌ (unchecked)
3. **Save** and copy the **Member ID** from the URL
   - URL: `https://your-site.com/ghost/#/members/64abc123...`
   - Copy: `64abc123...` (24 characters)

### 2. Run Installer

```bash
# Download
curl -o install.sh https://raw.githubusercontent.com/Cooperation-org/ghost-atproto/main/ghost-comments-shim/install.sh

# Make executable
chmod +x install.sh

# Run (requires sudo)
sudo ./install.sh
```

### 3. Answer Prompts

The installer will ask for:

- **Installation directory**: Press Enter for default (`/opt/ghost-comments-shim`)
- **Database type**: Enter `1` for MySQL or `2` for SQLite
- **Database details**:
  - **MySQL**: Host, port, database name, username, password
  - **SQLite**: Full path to Ghost's `.db` file
- **Bluesky Member ID**: Paste the ID from step 1
- **Port**: Press Enter for default (3001)

### 4. Save the Shared Secret

At the end, you'll see:

```
═══════════════════════════════════════════════════════
IMPORTANT: Save this shared secret for bridge configuration!
═══════════════════════════════════════════════════════

SHIM_SHARED_SECRET=abc123...xyz789

Add this to your bridge backend's .env file:
  SHIM_URL=http://localhost:3001
  SHIM_SHARED_SECRET=abc123...xyz789
```

**Copy and save this!** You need it for the bridge.

### 5. Verify Installation

```bash
# Check service is running
systemctl status ghost-comments-shim

# Test health endpoint
curl http://localhost:3001/health
# Should return: {"status":"ok"}
```

### 6. Configure Bridge

Add to your bridge backend's `.env` file:

```env
SHIM_URL=http://localhost:3001
SHIM_SHARED_SECRET=<paste-the-secret-here>
```

Then restart your bridge backend.

## Done! 🎉

Your shim is now ready to receive comments from the bridge.

## Test It

1. Create a test post in Ghost and publish it to Bluesky
2. Reply to the Bluesky post
3. Trigger a comment sync on the bridge
4. Check Ghost Admin → Your Post → Comments

## Troubleshooting

### Service won't start

```bash
# Check logs
sudo journalctl -u ghost-comments-shim -n 50
```

Common issues:
- Wrong database credentials → Check `.env` file
- Port already in use → Change `PORT` in `.env`
- Permission denied → Run `sudo chown -R ghost:ghost /opt/ghost-comments-shim`

### Can't connect to database

**MySQL:**
```bash
# Test connection
mysql -h localhost -u ghost -p ghost_production
```

**SQLite:**
```bash
# Check file exists
ls -l /var/www/ghost/content/data/ghost.db
```

### Need to change configuration

```bash
# Edit .env
sudo nano /opt/ghost-comments-shim/.env

# Restart service
sudo systemctl restart ghost-comments-shim
```

## Useful Commands

```bash
# View logs
sudo journalctl -u ghost-comments-shim -f

# Restart service
sudo systemctl restart ghost-comments-shim

# Stop service
sudo systemctl stop ghost-comments-shim

# Start service
sudo systemctl start ghost-comments-shim

# Check status
systemctl status ghost-comments-shim
```

## Manual Installation

If the automated installer doesn't work, see [INSTALL.md](INSTALL.md) for detailed manual installation instructions.

## Getting Help

- **Full Documentation**: [INSTALL.md](INSTALL.md)
- **Technical Details**: [README.md](README.md)
- **Publishing Guide**: [PUBLISH.md](PUBLISH.md)
- **Issues**: https://github.com/Cooperation-org/ghost-atproto/issues

## Security Notes

✅ **Do:**
- Keep the shared secret private
- Use strong database passwords
- Keep the shim updated (`npm update`)
- Monitor logs for errors

❌ **Don't:**
- Share the shared secret publicly
- Expose port 3001 to the internet
- Commit `.env` files to git
- Run with weak database permissions

## What's Next?

After installation:

1. **Set up comment sync** - Configure the bridge to poll for new replies
2. **Test thoroughly** - Post, reply, and verify comments appear
3. **Monitor logs** - Watch for any errors or issues
4. **Update regularly** - Check for package updates

## Upgrade

To upgrade to a new version:

```bash
cd /opt/ghost-comments-shim
sudo npm update @ghost-atproto/comments-shim
sudo systemctl restart ghost-comments-shim
```

## Uninstall

```bash
sudo systemctl stop ghost-comments-shim
sudo systemctl disable ghost-comments-shim
sudo rm /etc/systemd/system/ghost-comments-shim.service
sudo systemctl daemon-reload
sudo rm -rf /opt/ghost-comments-shim
```
