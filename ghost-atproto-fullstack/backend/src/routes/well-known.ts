import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * .well-known endpoint for standard.site verification
 *
 * This endpoint allows external services to verify that a domain is associated
 * with a specific ATProto publication record.
 *
 * Usage:
 * - Direct: GET /.well-known/site.standard.publication?handle=user.bsky.social
 * - Proxied from domain: GET https://yourblog.com/.well-known/site.standard.publication
 *   (requires nginx/Apache config to proxy to bridge with handle parameter)
 *
 * Returns: Plain text AT-URI of the publication
 * Example: at://did:plc:abc123xyz/site.standard.publication/3kz5tgr2bnd2p
 */
router.get('/site.standard.publication', async (req, res) => {
  try {
    const { handle, ghostUrl, userId } = req.query;

    let user = null;

    // Try to find user by different identifiers
    if (handle) {
      // Look up by Bluesky handle
      user = await prisma.user.findFirst({
        where: {
          blueskyHandle: handle as string,
        },
        select: {
          standardSitePublicationUri: true,
          ghostUrl: true,
          publicationName: true,
        },
      });
    } else if (ghostUrl) {
      // Look up by Ghost URL
      user = await prisma.user.findFirst({
        where: {
          ghostUrl: ghostUrl as string,
        },
        select: {
          standardSitePublicationUri: true,
          ghostUrl: true,
          publicationName: true,
        },
      });
    } else if (userId) {
      // Look up by user ID (for testing)
      user = await prisma.user.findUnique({
        where: {
          id: userId as string,
        },
        select: {
          standardSitePublicationUri: true,
          ghostUrl: true,
          publicationName: true,
        },
      });
    } else {
      return res.status(400).send('Missing required parameter: handle, ghostUrl, or userId');
    }

    if (!user) {
      return res.status(404).send('User not found');
    }

    if (!user.standardSitePublicationUri) {
      return res.status(404).send('No standard.site publication configured for this user');
    }

    // Return the publication URI as plain text (per standard.site spec)
    res.type('text/plain');
    res.send(user.standardSitePublicationUri);
  } catch (error) {
    console.error('Error in .well-known endpoint:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Health check endpoint for .well-known routes
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'well-known',
    usage: 'Query with one of: ?handle=USER_HANDLE, ?ghostUrl=GHOST_URL, or ?userId=USER_ID',
    examples: [
      '/.well-known/site.standard.publication?handle=yourhandle.bsky.social',
      '/.well-known/site.standard.publication?ghostUrl=https://yourblog.com',
      '/.well-known/site.standard.publication?userId=USER_ID',
    ],
  });
});

export default router;
