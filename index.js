const express = require('express');
const { NodeOAuthClient } = require('@atproto/oauth-client-node');
const { Agent } = require('@atproto/api');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

// OAuth client configuration
const oauthClient = new NodeOAuthClient({
  clientMetadata: {
    client_id: process.env.OAUTH_CLIENT_ID, // Your public metadata URL
    client_name: 'Ghost ATProto Publisher',
    redirect_uris: [process.env.OAUTH_REDIRECT_URI],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'ES256',
    scope: 'atproto transition:email',
    dpop_bound_access_tokens: true,
    application_type: 'web'
  },
  keyset: process.env.OAUTH_PRIVATE_KEY ? [JSON.parse(process.env.OAUTH_PRIVATE_KEY)] : []
});

// Store OAuth sessions (in production, use a proper database)
const sessions = new Map();

// OAuth authorization endpoint
app.get('/oauth/authorize', async (req, res) => {
  try {
    const handle = req.query.handle;
    if (!handle) {
      return res.status(400).send('Handle required');
    }

    const url = await oauthClient.authorize(handle, {
      scope: 'atproto transition:email'
    });

    res.redirect(url);
  } catch (error) {
    console.error('OAuth authorize error:', error);
    res.status(500).send('Authorization failed');
  }
});

// OAuth callback endpoint
app.get('/oauth/callback', async (req, res) => {
  try {
    const params = new URLSearchParams(req.url.split('?')[1]);
    const session = await oauthClient.callback(params);
    
    // Store session
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, session);

    res.send(`
      <html>
        <body>
          <h1>Authorization successful!</h1>
          <p>Session ID: ${sessionId}</p>
          <p>You can now configure your Ghost webhook with this session ID.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Callback failed');
  }
});

// Ghost webhook endpoint
app.post('/webhooks/ghost/published', async (req, res) => {
  try {
    // Verify Ghost webhook signature
    if (!verifyGhostWebhook(req)) {
      return res.status(401).send('Unauthorized');
    }

    const { post } = req.body;
    const sessionId = req.headers['x-atproto-session-id'];
    
    if (!sessionId || !sessions.has(sessionId)) {
      return res.status(401).send('No valid ATProto session');
    }

    const oauthSession = sessions.get(sessionId);
    
    // Create authenticated agent
    const agent = new Agent(oauthSession);

    // Convert and post to ATProto
    const atprotoPost = createAtprotoPost(post);
    await agent.post(atprotoPost);

    res.status(200).send('Posted to ATProto');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Failed to post');
  }
});

// Convert Ghost post to ATProto format
function createAtprotoPost(ghostPost) {
  const title = ghostPost.title;
  const excerpt = ghostPost.custom_excerpt || ghostPost.excerpt;
  const url = ghostPost.url;

  // ATProto has 300 char limit
  let text = `${title}\n\n${excerpt}`;

  // Truncate if needed and add link
  if (text.length > 250) {
    text = text.substring(0, 250) + '...';
  }
  text += `\n\nRead more: ${url}`;

  return {
    $type: 'app.bsky.feed.post',
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
    .update(JSON.stringify(req.body))
    .digest('hex');

  return hashValue === expectedHash;
}

// Setup endpoint for Ghost custom integration
app.get('/ghost/setup', (req, res) => {
  res.json({
    name: 'ATProto Publisher',
    description: 'Publishes Ghost posts to AT Protocol (Bluesky)',
    version: '0.1.0',
    webhooks: [
      {
        event: 'post.published',
        target_url: `${process.env.BASE_URL}/webhooks/ghost/published`
      }
    ],
    setup_url: `${process.env.BASE_URL}/setup`
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ghost ATProto integration running on port ${PORT}`);
});