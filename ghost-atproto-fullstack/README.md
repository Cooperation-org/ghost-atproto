# Ghost to AT Protocol Integration

A Ghost CMS custom integration that automatically publishes posts to AT Protocol networks (like Bluesky) using proper OAuth authentication.

## Features

- OAuth-based authentication (no passwords stored)
- Ghost custom integration with webhooks
- Converts Ghost posts to AT Protocol format
- Secure webhook signature verification

## Setup

### 1. Generate OAuth Keys

```bash
npm install
npm run setup
```

This generates an ES256 key pair and updates `oauth-client-metadata.json`.

### 2. Host Client Metadata

Host `oauth-client-metadata.json` at a public HTTPS URL. This URL becomes your `client_id`.

### 3. Configure Environment

Copy `.env.example` to `.env` and update:
- `OAUTH_CLIENT_ID`: Your metadata URL
- `OAUTH_REDIRECT_URI`: Your callback URL
- `OAUTH_PRIVATE_KEY`: Private key from setup
- `GHOST_WEBHOOK_SECRET`: Random secret for webhooks
- `BASE_URL`: Your integration's base URL

### 4. Deploy the Integration

```bash
npm start
```

### 5. Authorize an Account

1. Visit: `https://your-domain.com/oauth/authorize?handle=user.bsky.social`
2. Complete OAuth flow
3. Save the session ID

### 6. Configure Ghost

In Ghost Admin → Integrations → Add custom integration:
- Name: AT Protocol Publisher
- Add webhook:
  - Event: Post published
  - URL: `https://your-domain.com/webhooks/ghost/published`
  - Secret: Your `GHOST_WEBHOOK_SECRET`
  - Add custom header: `X-ATProto-Session-ID: [your-session-id]`

## How It Works

1. Ghost sends webhook when post is published
2. Integration verifies webhook signature
3. Uses OAuth session to authenticate with AT Protocol
4. Converts and posts content

## Development

```bash
cd ~/Desktop/ghost-atproto/ghost-atproto-fullstack/frontend
yarn  dev


cd ~/Desktop/ghost-atproto/ghost-atproto-fullstack/backend 
yarn  dev

ssh -i "ghostsky.pem" -L 3306:localhost:3306 ubuntu@ec2-204-236-176-29.us-west-1.compute.amazonaws.com
```


## Security Notes

- Never commit `.env` or private keys
- Use HTTPS for all endpoints
- Rotate webhook secrets regularly
- Store OAuth sessions in a database for production

## License

MIT