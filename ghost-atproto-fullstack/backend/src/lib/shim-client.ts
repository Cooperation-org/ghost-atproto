import dotenv from 'dotenv';

dotenv.config();

export interface CreateCommentRequest {
  post_id: string;
  bsky_handle: string;
  bsky_profile_url: string;
  bsky_post_url: string;
  comment_text: string;
  parent_comment_id: string | null;
  created_at: string;
}

export interface CreateCommentResponse {
  comment_id: string;
}

export interface ShimClientConfig {
  shimUrl: string;
  sharedSecret: string;
}

export class ShimClient {
  private config: ShimClientConfig;

  constructor(config: ShimClientConfig) {
    this.config = config;
  }

  /**
   * Create a comment in Ghost via the shim
   */
  async createComment(request: CreateCommentRequest): Promise<CreateCommentResponse> {
    const url = `${this.config.shimUrl}/comments`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.sharedSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        throw new Error(`Shim API error (${response.status}): ${errorData.error || response.statusText}`);
      }

      return await response.json() as CreateCommentResponse;
    } catch (error) {
      console.error('Error calling shim:', error);
      throw new Error(`Failed to create comment via shim: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Health check for the shim
   */
  async healthCheck(): Promise<boolean> {
    const url = `${this.config.shimUrl}/health`;

    try {
      const response = await fetch(url);
      const data = await response.json() as { status?: string };
      return response.ok && data.status === 'ok';
    } catch (error) {
      console.error('Shim health check failed:', error);
      return false;
    }
  }
}

/**
 * Create a shim client from environment variables
 */
export function createShimClient(): ShimClient {
  const shimUrl = process.env.SHIM_URL;
  const sharedSecret = process.env.SHIM_SHARED_SECRET;

  if (!shimUrl || !sharedSecret) {
    throw new Error('SHIM_URL and SHIM_SHARED_SECRET must be configured');
  }

  return new ShimClient({
    shimUrl,
    sharedSecret,
  });
}
