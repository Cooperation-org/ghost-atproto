import jwt from 'jsonwebtoken';

export interface GhostMemberData {
  email: string;
  name: string;
  note?: string;
  subscribed?: boolean;
  labels?: Array<{ name: string }>;
}

export interface GhostMember {
  id: string;
  email: string;
  name: string;
  note?: string;
  subscribed: boolean;
  labels?: Array<{ name: string }>;
}

/**
 * Create a JWT token for Ghost Admin API
 */
function createGhostAdminToken(apiKey: string): string {
  const [id, secret] = apiKey.split(':');
  if (!id || !secret) {
    throw new Error('Invalid API key format. Expected format: id:secret');
  }

  return jwt.sign({}, Buffer.from(secret, 'hex'), {
    keyid: id,
    algorithm: 'HS256',
    expiresIn: '5m',
    audience: `/admin/`
  });
}

/**
 * Create a member in Ghost
 */
export async function createGhostMember(
  ghostUrl: string,
  ghostApiKey: string,
  memberData: GhostMemberData
): Promise<GhostMember> {
  const token = createGhostAdminToken(ghostApiKey);

  const url = new URL(ghostUrl);
  const apiUrl = `${url.origin}/ghost/api/admin/members/`;

  const response = await global.fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Ghost ${token}`,
      'Accept-Version': 'v5.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      members: [memberData],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create Ghost member: ${response.statusText} - ${errorText}`);
  }

  const data: any = await response.json();
  return data.members[0];
}

/**
 * Get a member by email from Ghost
 */
export async function getGhostMemberByEmail(
  ghostUrl: string,
  ghostApiKey: string,
  email: string
): Promise<GhostMember | null> {
  const token = createGhostAdminToken(ghostApiKey);

  const url = new URL(ghostUrl);
  const apiUrl = `${url.origin}/ghost/api/admin/members/?filter=email:${encodeURIComponent(email)}`;

  try {
    const response = await global.fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Ghost ${token}`,
        'Accept-Version': 'v5.0',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data: any = await response.json();
    return data.members?.[0] || null;
  } catch (error) {
    console.error('Error fetching Ghost member:', error);
    return null;
  }
}

/**
 * Create or get the Bluesky member for comment sync
 */
export async function ensureBlueskyMember(
  ghostUrl: string,
  ghostApiKey: string
): Promise<GhostMember> {
  const email = 'comments@bsky.atproto.invalid';

  // Check if member already exists
  const existingMember = await getGhostMemberByEmail(ghostUrl, ghostApiKey, email);
  if (existingMember) {
    console.log('Bluesky member already exists:', existingMember.id);
    return existingMember;
  }

  // Create new member
  const memberData: GhostMemberData = {
    email,
    name: 'Bluesky',
    note: 'Bridged comments from Bluesky/ATProto',
    subscribed: false,
    labels: [{ name: 'bluesky-bridge' }],
  };

  const member = await createGhostMember(ghostUrl, ghostApiKey, memberData);
  console.log('Created Bluesky member:', member.id);
  return member;
}
