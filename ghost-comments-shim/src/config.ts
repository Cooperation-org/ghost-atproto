import dotenv from 'dotenv';

dotenv.config();

export type DbType = 'mysql' | 'sqlite';

export interface Config {
  ghostDbType: DbType;
  ghostDbConnection: string;
  bridgeSharedSecret: string;
  blueskyMemberId: string;
  port: number;
}

function validateEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateDbType(type: string): DbType {
  if (type !== 'mysql' && type !== 'sqlite') {
    throw new Error(`Invalid GHOST_DB_TYPE: ${type}. Must be 'mysql' or 'sqlite'`);
  }
  return type;
}

export function loadConfig(): Config {
  const ghostDbType = validateDbType(validateEnv('GHOST_DB_TYPE'));
  const ghostDbConnection = validateEnv('GHOST_DB_CONNECTION');
  const bridgeSharedSecret = validateEnv('BRIDGE_SHARED_SECRET');
  const blueskyMemberId = validateEnv('BLUESKY_MEMBER_ID');
  const port = parseInt(process.env.PORT || '3001', 10);

  // Validate secret strength
  if (bridgeSharedSecret.length < 32) {
    throw new Error('BRIDGE_SHARED_SECRET must be at least 32 characters');
  }

  // Validate member ID format (24-char hex)
  if (!/^[a-f0-9]{24}$/i.test(blueskyMemberId)) {
    throw new Error('BLUESKY_MEMBER_ID must be a 24-character hex string');
  }

  return {
    ghostDbType,
    ghostDbConnection,
    bridgeSharedSecret,
    blueskyMemberId,
    port,
  };
}
