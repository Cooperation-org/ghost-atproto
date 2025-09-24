const express = require('express');
const { BskyAgent } = require('@atproto/api');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Initialize Bluesky agent
const agent = new BskyAgent({
  service: 'https://bsky.social'
});

// Ghost webhook endpoint
app.post('/webhooks/ghost/published', async (req, res) => {
  try {
    // Verify webhook signature (Ghost security)
    if (!verifyGhostWebhook(req)) {
      return res.status(401).send('Unauthorized');
    }

    const { post } = req.body;

    // Login to Bluesky
    await agent.login({
      identifier: process.env.BLUESKY_HANDLE,
      password: process.env.BLUESKY_PASSWORD
    });

    // Convert and post to Bluesky
    const bskyPost = await createBskyPost(post);
    await agent.post(bskyPost);

    res.status(200).send('Posted to Bluesky');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Failed to post');
  }
});

// Convert Ghost post to Bluesky format
function createBskyPost(ghostPost) {
  // Extract title and excerpt for Bluesky post
  const title = ghostPost.title;
  const excerpt = ghostPost.custom_excerpt || ghostPost.excerpt;
  const url = ghostPost.url;

  // Bluesky has 300 char limit
  let text = `${title}\n\n${excerpt}`;

  // Truncate if needed and add link
  if (text.length > 250) {
    text = text.substring(0, 250) + '...';
  }
  text += `\n\nRead more: ${url}`;

  return {
    text: text,
    createdAt: new Date().toISOString()
  };
}

// Verify Ghost webhook signature
function verifyGhostWebhook(req) {
  const signature = req.headers['x-ghost-signature'];
  const secret = process.env.GHOST_WEBHOOK_SECRET;

  if (!signature || !secret) return false;

  const [hash, timestamp] = signature.split(', ');
  const [hashPrefix, hashValue] = hash.split('=');

  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('hex');

  return hashValue === expectedHash;
}

app.listen(3000, () => {
  console.log('Ghost-to-Bluesky bridge running on port 3000');
});