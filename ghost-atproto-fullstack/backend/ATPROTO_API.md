# ATProto API Endpoint Documentation

## Overview

This document describes the new ATProto API endpoint for publishing Ghost posts to Bluesky/ATProto.

## Endpoint

### POST `/api/atproto/publish`

Publishes a post from the database to Bluesky using the ATProto protocol.

#### Request Body
```json
{
  "postId": "string" // Required: The ID of the post to publish
}
```

#### Response

**Success (200):**
```json
{
  "success": true,
  "message": "Post published to ATProto successfully",
  "postId": "post-id-here",
  "title": "Post Title",
  "atprotoUri": "at://did:plc:example/app.bsky.feed.post/record-id",
  "atprotoCid": "bafyreigi..."
}
```

**Error (400) - Missing Post ID:**
```json
{
  "error": "Post ID is required"
}
```

**Error (404) - Post Not Found:**
```json
{
  "error": "Post not found"
}
```

**Error (400) - Post Not Published:**
```json
{
  "error": "Only published posts can be synced to ATProto"
}
```

**Error (500) - Server Error:**
```json
{
  "error": "Failed to publish to ATProto",
  "details": "Error message details"
}
```

#### Example Usage

```bash
# Publish a post to Bluesky
curl -X POST http://localhost:5001/api/atproto/publish \
  -H "Content-Type: application/json" \
  -d '{"postId": "your-post-id-here"}'
```

## Additional Endpoints

### GET `/api/atproto/sync-logs/:postId`

Get sync logs for a specific post.

#### Response
```json
[
  {
    "id": "log-id",
    "action": "publish_to_atproto",
    "status": "success",
    "source": "ghost",
    "target": "atproto",
    "postId": "post-id",
    "ghostId": "ghost-post-id",
    "atprotoUri": "at://...",
    "error": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### GET `/api/atproto/sync-logs`

Get all sync logs (last 100).

## Environment Variables Required

Add these to your `.env` file:

```bash
# Bluesky/ATProto Configuration
BLUESKY_SERVICE_URL="https://bsky.social"
BLUESKY_IDENTIFIER="your-handle.bsky.social"
BLUESKY_APP_PASSWORD="your-app-password"
```

## Content Formatting

The endpoint automatically formats Ghost posts for Bluesky:

1. **Title**: Used as the primary content
2. **Content Preview**: HTML is stripped and limited to 200 characters
3. **Link**: Original Ghost URL is appended if available
4. **Character Limit**: Total content is limited to 280 characters (similar to Twitter)

## Database Integration

The endpoint:

1. **Retrieves** the post from the database using the provided `postId`
2. **Validates** that the post exists and is published
3. **Formats** the content for Bluesky
4. **Publishes** to Bluesky via ATProto
5. **Updates** the post record with ATProto URI and CID
6. **Logs** the sync operation in the `sync_logs` table

## Error Handling

- All errors are logged to the `sync_logs` table
- Detailed error messages are returned in the API response
- The endpoint gracefully handles authentication failures, network issues, and database errors

## Security Considerations

- Store Bluesky credentials securely in environment variables
- Use app passwords instead of main account passwords
- Validate post ownership if implementing user authentication
- Rate limit the endpoint to prevent abuse