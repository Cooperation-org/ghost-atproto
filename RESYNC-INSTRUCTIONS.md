# 🔄 Re-sync Articles with Full Content

## The Problem
Your articles were synced before we fixed the Ghost API to request full content. Now they only have titles and photos, but no article text.

## The Solution
Follow these steps to clear old posts and re-sync with full content:

---

## 📋 Step-by-Step Instructions

### Step 1: Make Sure Backend is Running
```bash
cd ghost-atproto-fullstack/backend
npm run dev
```

Keep this terminal open. You should see:
```
🚀 Backend server running on http://localhost:5000
```

---

### Step 2: Open a NEW Terminal and Run the Re-sync Script

In a **NEW terminal window**, run:

```bash
cd ghost-atproto-fullstack/backend
node clear-and-resync.js
```

This script will:
1. ✅ Delete all old posts (without content)
2. ✅ Delete sync logs
3. ✅ Trigger a fresh sync from Ghost
4. ✅ Download FULL article content (HTML)
5. ✅ Post to Bluesky
6. ✅ Save everything to database

---

### Step 3: Wait for Completion

You'll see output like:
```
🗑️  Step 1: Clearing existing posts from database...
   ✅ Deleted 5 posts
   ✅ Deleted 10 sync logs

🔄 Step 2: Finding your user account...
   ✅ Found user: your@email.com
   📍 Ghost URL: https://yourblog.com
   🦋 Bluesky: yourhandle.bsky.social

🚀 Step 3: Triggering fresh sync with full content...
   Please wait, this may take a few minutes...

📖 Found 5 posts
📝 Processing "Your Article Title": Content length = 15847 chars
✅ Shared "Your Article Title" to Bluesky

✨ Sync Complete!
   📊 Synced: 5 posts
   ⏭️  Skipped: 0 posts
   📝 Total processed: 5 posts

✅ All done! Your articles now have full content.
```

---

### Step 4: Check Your Dashboard

1. Open your browser and go to: **http://localhost:3000/dashboard**
2. Click on any article to view it
3. **You should now see the FULL article content!** 📝

---

## 🎯 What Was Fixed

### Before:
- Ghost API returned only basic metadata
- Articles had only: title, excerpt, photo
- No full content text

### After:
- Ghost API now requests: `html`, `plaintext`, `mobiledoc`
- Articles now include: **FULL HTML CONTENT**
- Content displays beautifully on article pages

---

## ⚠️ Troubleshooting

### Error: "No configured user found"
**Solution:** Complete the wizard first at http://localhost:3000/wizard

### Error: "Sync failed"
**Solution:** Make sure backend is running (`npm run dev` in backend folder)

### Error: "Failed to validate Ghost connection"
**Solution:** Check your Ghost URL and API key in the wizard

### Articles still showing no content?
1. Check backend logs for "Content length = X chars"
2. If length is 0, your Ghost API might not be returning content
3. Try updating Ghost to the latest version
4. Verify your Ghost Admin API key has read permissions

---

## 🔍 Verify Content in Database

Want to see your data directly?

```bash
cd ghost-atproto-fullstack/backend
npx prisma studio
```

Then:
1. Open http://localhost:5555
2. Click on "Post" table
3. Click any post
4. Check the "content" field - it should have full HTML!

---

## ✅ Success Checklist

- [ ] Backend server is running
- [ ] Re-sync script completed successfully
- [ ] Dashboard shows articles
- [ ] Clicking an article shows FULL text content
- [ ] Posts are visible on Bluesky

---

**Need help?** Check the backend terminal logs for detailed error messages.

