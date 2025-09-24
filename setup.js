const { generateKeyPair } = require('jose');
const fs = require('fs').promises;

async function generateOAuthKeys() {
  console.log('Generating OAuth ES256 key pair...');
  
  // Generate ES256 key pair
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  
  // Export keys as JWK
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);
  
  // Add key metadata
  publicJwk.use = 'sig';
  publicJwk.alg = 'ES256';
  publicJwk.kid = crypto.randomUUID();
  
  privateJwk.use = 'sig';
  privateJwk.alg = 'ES256';
  privateJwk.kid = publicJwk.kid;
  
  // Update oauth-client-metadata.json with public key
  const metadata = JSON.parse(await fs.readFile('./oauth-client-metadata.json', 'utf8'));
  metadata.jwks.keys = [publicJwk];
  
  await fs.writeFile('./oauth-client-metadata.json', JSON.stringify(metadata, null, 2));
  
  console.log('\nPublic key added to oauth-client-metadata.json');
  console.log('\nAdd this to your .env file:');
  console.log(`OAUTH_PRIVATE_KEY='${JSON.stringify(privateJwk)}'`);
  console.log('\nMake sure to:');
  console.log('1. Host oauth-client-metadata.json at the URL specified as client_id');
  console.log('2. Update all URLs in oauth-client-metadata.json to match your domain');
  console.log('3. Set up Ghost custom integration with the webhook URL');
}

async function exportJWK(key) {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  return jwk;
}

// Run setup
generateOAuthKeys().catch(console.error);