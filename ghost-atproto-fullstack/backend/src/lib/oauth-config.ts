import dotenv from 'dotenv';

dotenv.config();

export const oauthConfig = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://127.0.0.1:5000/api/auth/google/callback',
  },
  bluesky: {
    // RFC 8252 requires 127.0.0.1 instead of localhost for loopback
    clientId: process.env.BLUESKY_CLIENT_ID || 'http://127.0.0.1:5000/client-metadata.json',
    redirectUri: process.env.BLUESKY_REDIRECT_URI || 'http://127.0.0.1:5000/api/auth/bluesky/callback',
    scope: 'atproto transition:generic',
  },
  session: {
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  }
};

export function validateOAuthConfig() {
  const warnings: string[] = [];

  if (!oauthConfig.google.clientId || !oauthConfig.google.clientSecret) {
    warnings.push('⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  }

  // Bluesky OAuth is currently disabled (placeholder implementation)
  // warnings.push('ℹ️  Bluesky OAuth: Use app passwords in settings for now');

  if (warnings.length > 0) {
    console.log('\n📝 OAuth Configuration:');
    for (const warning of warnings) {
      console.log(warning);
    }
    console.log('');
  }

  return warnings.length === 0;
}

