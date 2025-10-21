# Server Deployment Instructions

## 🔑 Your Server Connection

I can see you have `ghostsky.pem` which suggests you're using SSH to connect to your server. Here's how to deploy the fixes:

## 📋 Step-by-Step Deployment

### 1. Connect to Your Server
```bash
# From your local machine, connect to your server
ssh -i ghostsky.pem ubuntu@your-server-ip
# or
ssh -i ghostsky.pem root@your-server-ip
```

### 2. Deploy Frontend Changes
```bash
# Once connected to your server
cd ~/ghost-atproto/ghost-atproto-fullstack

# Pull the latest changes
git pull origin main

# Update frontend
cd frontend
npm ci
npm run build

# Restart frontend service
pm2 restart atproto-frontend
```

### 3. Deploy Enhanced Nginx Configuration
```bash
# Update nginx configuration
sudo cp backend/nginx-bridge-enhanced.conf /etc/nginx/sites-available/default

# Test configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

### 4. Verify Deployment
```bash
# Check services
pm2 list
pm2 logs atproto-frontend --lines 20

# Check nginx status
sudo systemctl status nginx
```

## 🧪 Local Testing (Current)

Right now, you can test the fixes locally:

1. **Frontend is running** at `http://localhost:3000/bridge`
2. **Open browser console** and check for errors
3. **Look for crypto.randomUUID errors** - they should be gone
4. **Check Network tab** for any static asset loading issues

## 🔍 What to Check After Server Deployment

1. **Browser Console**: No `crypto.randomUUID` errors
2. **Network Tab**: No 400/404 errors for static assets
3. **Application**: Functions normally
4. **Performance**: Should be improved

## 🆘 Troubleshooting

If you encounter issues:

1. **Check PM2 logs:**
   ```bash
   pm2 logs atproto-frontend
   ```

2. **Check nginx logs:**
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

3. **Restart everything:**
   ```bash
   pm2 restart all
   sudo systemctl reload nginx
   ```

4. **Clear browser cache** and test again

## ✅ Current Status

- ✅ Frontend builds successfully
- ✅ Crypto polyfill implemented
- ✅ ESLint errors fixed
- ✅ Enhanced nginx config ready
- 🔄 Ready for server deployment

The fixes are complete and ready to deploy to your server!
