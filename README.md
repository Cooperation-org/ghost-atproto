# Ghost to Bluesky Bridge

Automatically post your Ghost blog posts to Bluesky using webhooks.

## Features

- Receives Ghost webhook notifications when posts are published
- Converts Ghost posts to Bluesky format
- Handles authentication with Bluesky
- Docker support for easy deployment

## Quick Start

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your credentials
3. Install dependencies: `npm install`
4. Start the server: `npm start`

## Configuration

### Environment Variables

- `BLUESKY_HANDLE`: Your Bluesky handle (e.g., yourname.bsky.social)
- `BLUESKY_PASSWORD`: Your Bluesky app password
- `GHOST_WEBHOOK_SECRET`: Secret for verifying Ghost webhooks

### Ghost Webhook Setup

1. Go to Ghost Admin → Integrations → Webhooks
2. Create new webhook:
   - Name: Bluesky Bridge
   - Event: Post published
   - URL: `https://your-domain.com/webhooks/ghost/published`
   - Secret: Your chosen secret (use in GHOST_WEBHOOK_SECRET)

## Docker Deployment

```bash
docker-compose up -d
```

## Development

```bash
npm run dev
```

## License

MIT