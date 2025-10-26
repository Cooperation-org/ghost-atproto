import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { SimpleStore } from '@atproto-labs/simple-store';
import { PrismaClient } from '@prisma/client';
import { Agent } from '@atproto/api';

const prisma = new PrismaClient();

/**
 * Proper ATProto OAuth Implementation following the official spec
 * https://github.com/bluesky-social/atproto/blob/main/packages/api/OAUTH.md
 */

// Database-backed storage for OAuth state and sessions
class PrismaStateStore implements SimpleStore<string, any> {
    async get(key: string) {
        const record = await prisma.oAuthState.findUnique({ where: { key } });
        return record ? JSON.parse(record.value) : undefined;
    }

    async set(key: string, value: any) {
        await prisma.oAuthState.upsert({
            where: { key },
            update: { value: JSON.stringify(value), updatedAt: new Date() },
            create: { key, value: JSON.stringify(value) }
        });
    }

    async del(key: string) {
        await prisma.oAuthState.delete({ where: { key } }).catch(() => {});
    }
}

class PrismaSessionStore implements SimpleStore<string, any> {
    async get(key: string) {
        const record = await prisma.oAuthSession.findUnique({ where: { key } });
        return record ? JSON.parse(record.value) : undefined;
    }

    async set(key: string, value: any) {
        await prisma.oAuthSession.upsert({
            where: { key },
            update: { value: JSON.stringify(value), updatedAt: new Date() },
            create: { key, value: JSON.stringify(value) }
        });
    }

    async del(key: string) {
        await prisma.oAuthSession.delete({ where: { key } }).catch(() => {});
    }
}

let oauthClient: NodeOAuthClient | null = null;

export async function getOAuthClient(): Promise<NodeOAuthClient> {
    if (oauthClient) return oauthClient;

    const appUrl = process.env.APP_URL || 'http://127.0.0.1:5000';
    const clientId = `${appUrl}/client-metadata.json`;
    
    // For production, must use HTTPS
    if (process.env.NODE_ENV === 'production' && !appUrl.startsWith('https://')) {
        throw new Error('Production OAuth requires HTTPS URL in APP_URL');
    }

    oauthClient = new NodeOAuthClient({
        clientMetadata: {
            client_id: clientId,
            client_name: 'Ghost ATProto Bridge',
            client_uri: appUrl,
            logo_uri: `${appUrl}/logo.png`,
            tos_uri: `${appUrl}/terms`,
            policy_uri: `${appUrl}/privacy`,
            redirect_uris: [`${appUrl}/api/auth/callback`],
            scope: 'atproto transition:generic',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            application_type: 'web',
            dpop_bound_access_tokens: true,
        },
        stateStore: new PrismaStateStore(),
        sessionStore: new PrismaSessionStore(),
    });

    console.log(`✅ ATProto OAuth client initialized for ${appUrl}`);
    return oauthClient;
}

/**
 * Initiate OAuth flow
 */
export async function initiateOAuthLogin(handle: string): Promise<string> {
    const client = await getOAuthClient();
    
    try {
        const url = await client.authorize(handle, {
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
 * Handle OAuth callback
 */
export async function handleOAuthCallback(params: URLSearchParams): Promise<{
    user: any;
    session: any;
}> {
    const client = await getOAuthClient();
    
    try {
        const { session } = await client.callback(params);
        const did = session.did;
        
        // Get user profile using the session
        const agent = new Agent(session);
        const profile = await agent.getProfile({ actor: did });
        
        const handle = profile.data.handle;
        const displayName = profile.data.displayName || handle;
        const avatar = profile.data.avatar;
        
        // Create or update user - NO PASSWORD STORAGE
        let user = await prisma.user.findUnique({ 
            where: { blueskyDid: did } 
        });
        
        if (user) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: { 
                    name: displayName, 
                    blueskyHandle: handle,
                    avatar,
                    lastLoginAt: new Date()
                },
            });
        } else {
            // For Bluesky users, we don't have email initially
            user = await prisma.user.create({
                data: { 
                    blueskyDid: did,
                    blueskyHandle: handle,
                    name: displayName,
                    avatar,
                    role: 'USER',
                    lastLoginAt: new Date()
                },
            });
        }
        
        console.log(`✅ OAuth session created for ${handle} (${did})`);
        
        return { user, session };
    } catch (error) {
        console.error('OAuth callback error:', error);
        throw error;
    }
}

/**
 * Get authenticated Agent for a user's DID
 */
export async function getAgentForDid(did: string): Promise<Agent | null> {
    const client = await getOAuthClient();
    
    try {
        const session = await client.restore(did);
        return new Agent(session);
    } catch (error) {
        console.error('Failed to restore session:', error);
        return null;
    }
}

/**
 * Revoke a session
 */
export async function revokeSession(did: string): Promise<void> {
    const client = await getOAuthClient();
    
    try {
        await client.revoke(did);
        console.log(`✅ Revoked session for ${did}`);
    } catch (error) {
        console.error('Failed to revoke session:', error);
    }
}
