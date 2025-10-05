import { AtpAgent } from '@atproto/api';
import dotenv from 'dotenv';

dotenv.config();

export async function publishToBluesky(content: string): Promise<{ uri: string; cid: string }> {
  const agent = new AtpAgent({ 
    service: process.env.BLUESKY_SERVICE_URL || 'https://bsky.social' 
  });
  
  const identifier = process.env.BLUESKY_IDENTIFIER ;
  const password = process.env.BLUESKY_APP_PASSWORD ;

  if (!identifier || !password) {
    throw new Error('Bluesky credentials not configured');
  }

  try {
    await agent.login({
      identifier,
      password
    });
    
    const response = await agent.post({
      text: content,
      createdAt: new Date().toISOString()
    });

    return {
      uri: response.uri,
      cid: response.cid
    };
  } catch (error) {
    console.error('Error publishing to Bluesky:', error);
    throw new Error(`Failed to publish to Bluesky: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}