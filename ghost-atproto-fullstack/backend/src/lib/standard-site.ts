import { AtpAgent } from '@atproto/api';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Standard.site lexicon types
 */
export interface StandardSitePublication {
  $type: 'site.standard.publication';
  url: string;
  name: string;
  description?: string;
  icon?: Blob;
  basicTheme?: {
    accentColor?: string;
    backgroundColor?: string;
  };
}

export interface StandardSiteDocument {
  $type: 'site.standard.document';
  title: string;
  site: string; // AT-URI reference to publication
  path: string;
  content: string;
  textContent?: string;
  publishedAt: string;
  theme?: {
    accentColor?: string;
    backgroundColor?: string;
  };
  tags?: string[];
}

export interface PublicationMetadata {
  url: string;
  name: string;
  description?: string;
  icon?: string; // URL to icon
}

export interface PublicationResult {
  uri: string;
  cid: string;
  rkey: string;
}

export interface DocumentResult {
  uri: string;
  cid: string;
}

/**
 * Create a site.standard.publication record
 * This represents the blog/publication itself (created once per user)
 */
export async function createPublication(
  agent: AtpAgent,
  metadata: PublicationMetadata
): Promise<PublicationResult> {
  try {
    if (!agent.session) {
      throw new Error('Agent must be authenticated');
    }

    const record: Record<string, unknown> = {
      $type: 'site.standard.publication',
      url: metadata.url,
      name: metadata.name,
      description: metadata.description,
    };

    // TODO: Handle icon upload if metadata.icon is provided
    // This would require uploading the image as a blob first

    const response = await agent.com.atproto.repo.createRecord({
      repo: agent.session.did,
      collection: 'site.standard.publication',
      record,
    });

    // Extract rkey from URI (at://did:xxx/collection/rkey)
    const rkey = response.data.uri.split('/').pop() || '';

    return {
      uri: response.data.uri,
      cid: response.data.cid,
      rkey,
    };
  } catch (error) {
    console.error('Error creating publication:', error);
    throw new Error(
      `Failed to create publication: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Create a site.standard.document record
 * This represents an individual blog post/article
 */
export async function createDocument(
  agent: AtpAgent,
  publicationUri: string,
  post: {
    title: string;
    content: string;
    slug: string;
    publishedAt: Date | string;
    excerpt?: string;
  }
): Promise<DocumentResult> {
  try {
    if (!agent.session) {
      throw new Error('Agent must be authenticated');
    }

    // Convert HTML content to plain text for textContent field
    const textContent = post.excerpt || stripHtml(post.content).substring(0, 500);

    // Format path (ensure it starts with /)
    const path = post.slug.startsWith('/') ? post.slug : `/${post.slug}`;

    // Ensure publishedAt is ISO string
    const publishedAt =
      typeof post.publishedAt === 'string'
        ? post.publishedAt
        : post.publishedAt.toISOString();

    const record: Record<string, unknown> = {
      $type: 'site.standard.document',
      title: post.title,
      site: publicationUri,
      path,
      content: post.content,
      textContent,
      publishedAt,
    };

    const response = await agent.com.atproto.repo.createRecord({
      repo: agent.session.did,
      collection: 'site.standard.document',
      record,
    });

    return {
      uri: response.data.uri,
      cid: response.data.cid,
    };
  } catch (error) {
    console.error('Error creating document:', error);
    throw new Error(
      `Failed to create document: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get existing publication URI for a user, or create one if it doesn't exist
 */
export async function getOrCreatePublication(
  agent: AtpAgent,
  userId: string,
  metadata: PublicationMetadata
): Promise<PublicationResult> {
  try {
    // Check if user already has a publication
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        standardSitePublicationUri: true,
        standardSitePublicationRkey: true,
      },
    });

    if (user?.standardSitePublicationUri && user?.standardSitePublicationRkey) {
      // Publication already exists
      return {
        uri: user.standardSitePublicationUri,
        cid: '', // We don't store CID in database, but it's not needed for existing records
        rkey: user.standardSitePublicationRkey,
      };
    }

    // Create new publication
    const result = await createPublication(agent, metadata);

    // Store in database
    await prisma.user.update({
      where: { id: userId },
      data: {
        standardSitePublicationUri: result.uri,
        standardSitePublicationRkey: result.rkey,
        publicationName: metadata.name,
        publicationDescription: metadata.description,
      },
    });

    return result;
  } catch (error) {
    console.error('Error in getOrCreatePublication:', error);
    throw new Error(
      `Failed to get or create publication: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Verify that a publication exists and is accessible
 */
export async function verifyPublication(
  agent: AtpAgent,
  publicationUri: string
): Promise<boolean> {
  try {
    if (!agent.session) {
      throw new Error('Agent must be authenticated');
    }

    // Parse the URI to get repo, collection, and rkey
    // Format: at://did:plc:xxx/site.standard.publication/rkey
    const parts = publicationUri.replace('at://', '').split('/');
    if (parts.length !== 3) {
      throw new Error('Invalid publication URI format');
    }

    const [repo, collection, rkey] = parts;

    // Try to fetch the record
    const response = await agent.com.atproto.repo.getRecord({
      repo,
      collection,
      rkey,
    });

    return response.data.value && (response.data.value as any).$type === 'site.standard.publication';
  } catch (error) {
    console.error('Error verifying publication:', error);
    return false;
  }
}

/**
 * Helper function to strip HTML tags from content
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&[a-z]+;/gi, '') // Remove other HTML entities
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Generate the canonical URL for a post
 */
export function getCanonicalUrl(publicationUrl: string, documentPath: string): string {
  const baseUrl = publicationUrl.endsWith('/') ? publicationUrl.slice(0, -1) : publicationUrl;
  const path = documentPath.startsWith('/') ? documentPath : `/${documentPath}`;
  return `${baseUrl}${path}`;
}
