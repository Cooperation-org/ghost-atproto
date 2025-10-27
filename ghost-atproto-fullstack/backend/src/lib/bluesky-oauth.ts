import { NodeOAuthClient, NodeSavedState, NodeSavedSession } from '@atproto/oauth-client-node';
import { SimpleStoreMemory } from '@atproto-labs/simple-store-memory';
import { PrismaClient } from '@prisma/client';
import { oauthConfig } from './oauth-config';

const prisma = new PrismaClient();

/**
 * Bluesky OAuth Implementation following official Statusphere example
 * https://docs.bsky.app/docs/starter-templates/apps
 */

let oauthClient: NodeOAuthClient | null = null;

export async function setupBlueskyOAuth() {
  try {
    // Check if we have a production setup (real domain with HTTPS)
    const hasProductionSetup = 
      process.env.APP_URL?.startsWith('https://') && 
      !process.env.APP_URL.includes('localhost') &&
      !process.env.APP_URL.includes('127.0.0.1');

    if (!hasProductionSetup) {
      console.log('⚠️  Bluesky OAuth requires HTTPS + domain name');
      console.log('ℹ️  For development: Use Bluesky app passwords (Settings → App Passwords)');
      console.log('ℹ️  For production: Set APP_URL to your https:// domain');
      return null;
    }

    // Create in-memory stores for state and session with proper types
    const stateStore = new SimpleStoreMemory<string, NodeSavedState>({ 
      max: 100, 
      ttl: 10 * 60 * 1000, 
      ttlAutopurge: true 
    });
    const sessionStore = new SimpleStoreMemory<string, NodeSavedSession>({ max: 100 });

    // Production setup with proper domain
    const appUrl = process.env.APP_URL!;
    const clientId = process.env.BLUESKY_CLIENT_ID || `${appUrl}/client-metadata.json`;
    const redirectUri = process.env.BLUESKY_REDIRECT_URI || `${appUrl}/api/auth/bluesky/callback`;

    // Initialize OAuth client for production
    oauthClient = new NodeOAuthClient({
      clientMetadata: {
        client_id: clientId,
        client_name: 'Ghost ATProto Bridge',
        client_uri: appUrl,
        redirect_uris: [redirectUri],
        scope: 'atproto transition:generic',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        application_type: 'web',
        dpop_bound_access_tokens: true,
      },
      stateStore,
      sessionStore,
    });

    console.log(`✅ Bluesky ATProto OAuth configured for production`);
    return oauthClient;
  } catch (error) {
    console.error('Failed to setup Bluesky OAuth:', error);
    console.log('ℹ️  Falling back to app password authentication');
    return null;
  }
}

export function getBlueskyOAuthClient(): NodeOAuthClient | null {
  return oauthClient;
}

/**
 * Initiate OAuth flow (following statusphere example)
 */
export async function initiateBlueskyLogin(handle: string): Promise<string> {
  if (!oauthClient) {
    throw new Error('OAuth client not initialized');
  }

  try {
    // Exactly like statusphere: await oauthClient.authorize(handle, { scope: ... })
    const url = await oauthClient.authorize(handle, {
      scope: 'atproto transition:generic',
    });

    console.log(`✅ Generated OAuth URL for ${handle}`);
    return url.toString();
  } catch (error) {
    console.error('Failed to initiate OAuth:', error);
    throw new Error(`Failed to resolve handle: ${handle}`);
  }
}

/**
 * Handle OAuth callback (following statusphere example)
 */
export async function handleBlueskyCallback(params: URLSearchParams): Promise<{
  user: any;
  did: string;
}> {
  if (!oauthClient) {
    throw new Error('OAuth client not initialized');
  }

  try {
    // Exactly like statusphere: const { session } = await oauthClient.callback(params)
    const { session } = await oauthClient.callback(params);
    const did = session.did;

    // Get agent for this session
    const agent = await oauthClient.restore(did);
    
    // Import BskyAgent to get profile
    const { BskyAgent } = await import('@atproto/api');
    const bskyAgent = new BskyAgent({ service: 'https://bsky.social' });
    
    // Restore session from OAuth client (agent here is OAuthSession, not BskyAgent)
    if ('accessJwt' in agent && 'refreshJwt' in agent) {
      await bskyAgent.resumeSession({
        accessJwt: agent.accessJwt as string,
        refreshJwt: agent.refreshJwt as string,
        did,
        handle: '',
        active: true,
      });
    }
    
    const profile = await bskyAgent.getProfile({ actor: did });
    const handle = profile.data.handle;
    const displayName = profile.data.displayName || handle;

    // Find or create user
    const email = `${handle.replaceAll('.', '_')}@bsky.social`;
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: displayName, blueskyHandle: handle, blueskyDid: did },
      });
    } else {
      user = await prisma.user.create({
        data: { email, name: displayName, role: 'USER', blueskyHandle: handle, blueskyDid: did, password: '' },
      });
    }

    console.log(`✅ OAuth session created for ${handle} (${did})`);

    return { user, did };
  } catch (error) {
    console.error('OAuth callback error:', error);
    throw error;
  }
}

/**
 * Get authenticated agent for user (using OAuth client restore)
 */
export async function getBlueskyAgent(userId: string) {
  if (!oauthClient) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.blueskyDid) {
    return null;
  }

  try {
    // Use OAuth client to restore session
    const agent = await oauthClient.restore(user.blueskyDid);
    return agent;
  } catch (error) {
    console.error('Failed to restore agent:', error);
    return null;
  }
}

