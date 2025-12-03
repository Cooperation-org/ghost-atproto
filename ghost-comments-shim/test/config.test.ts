import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw when GHOST_DB_TYPE is missing', () => {
    delete process.env.GHOST_DB_TYPE;
    expect(() => loadConfig()).toThrow('Missing required environment variable: GHOST_DB_TYPE');
  });

  it('should throw when GHOST_DB_TYPE is invalid', () => {
    process.env.GHOST_DB_TYPE = 'postgres';
    process.env.GHOST_DB_CONNECTION = 'test';
    process.env.BRIDGE_SHARED_SECRET = 'a'.repeat(32);
    process.env.BLUESKY_MEMBER_ID = '507f1f77bcf86cd799439011';

    expect(() => loadConfig()).toThrow("Invalid GHOST_DB_TYPE: postgres. Must be 'mysql' or 'sqlite'");
  });

  it('should throw when GHOST_DB_CONNECTION is missing', () => {
    process.env.GHOST_DB_TYPE = 'mysql';
    delete process.env.GHOST_DB_CONNECTION;

    expect(() => loadConfig()).toThrow('Missing required environment variable: GHOST_DB_CONNECTION');
  });

  it('should throw when BRIDGE_SHARED_SECRET is missing', () => {
    process.env.GHOST_DB_TYPE = 'mysql';
    process.env.GHOST_DB_CONNECTION = 'mysql://test';
    delete process.env.BRIDGE_SHARED_SECRET;

    expect(() => loadConfig()).toThrow('Missing required environment variable: BRIDGE_SHARED_SECRET');
  });

  it('should throw when BRIDGE_SHARED_SECRET is too short', () => {
    process.env.GHOST_DB_TYPE = 'mysql';
    process.env.GHOST_DB_CONNECTION = 'mysql://test';
    process.env.BRIDGE_SHARED_SECRET = 'short';
    process.env.BLUESKY_MEMBER_ID = '507f1f77bcf86cd799439011';

    expect(() => loadConfig()).toThrow('BRIDGE_SHARED_SECRET must be at least 32 characters');
  });

  it('should throw when BLUESKY_MEMBER_ID is missing', () => {
    process.env.GHOST_DB_TYPE = 'mysql';
    process.env.GHOST_DB_CONNECTION = 'mysql://test';
    process.env.BRIDGE_SHARED_SECRET = 'a'.repeat(32);
    delete process.env.BLUESKY_MEMBER_ID;

    expect(() => loadConfig()).toThrow('Missing required environment variable: BLUESKY_MEMBER_ID');
  });

  it('should throw when BLUESKY_MEMBER_ID has invalid format', () => {
    process.env.GHOST_DB_TYPE = 'mysql';
    process.env.GHOST_DB_CONNECTION = 'mysql://test';
    process.env.BRIDGE_SHARED_SECRET = 'a'.repeat(32);
    process.env.BLUESKY_MEMBER_ID = 'invalid-id';

    expect(() => loadConfig()).toThrow('BLUESKY_MEMBER_ID must be a 24-character hex string');
  });

  it('should load valid config for mysql', () => {
    process.env.GHOST_DB_TYPE = 'mysql';
    process.env.GHOST_DB_CONNECTION = 'mysql://ghost:pass@localhost:3306/ghost';
    process.env.BRIDGE_SHARED_SECRET = 'a'.repeat(32);
    process.env.BLUESKY_MEMBER_ID = '507f1f77bcf86cd799439011';
    process.env.PORT = '4000';

    const config = loadConfig();

    expect(config.ghostDbType).toBe('mysql');
    expect(config.ghostDbConnection).toBe('mysql://ghost:pass@localhost:3306/ghost');
    expect(config.bridgeSharedSecret).toBe('a'.repeat(32));
    expect(config.blueskyMemberId).toBe('507f1f77bcf86cd799439011');
    expect(config.port).toBe(4000);
  });

  it('should load valid config for sqlite', () => {
    process.env.GHOST_DB_TYPE = 'sqlite';
    process.env.GHOST_DB_CONNECTION = '/var/www/ghost/content/data/ghost.db';
    process.env.BRIDGE_SHARED_SECRET = 'b'.repeat(32);
    process.env.BLUESKY_MEMBER_ID = 'abcdef0123456789abcdef01';

    const config = loadConfig();

    expect(config.ghostDbType).toBe('sqlite');
    expect(config.ghostDbConnection).toBe('/var/www/ghost/content/data/ghost.db');
  });

  it('should default port to 3001', () => {
    process.env.GHOST_DB_TYPE = 'mysql';
    process.env.GHOST_DB_CONNECTION = 'mysql://test';
    process.env.BRIDGE_SHARED_SECRET = 'a'.repeat(32);
    process.env.BLUESKY_MEMBER_ID = '507f1f77bcf86cd799439011';
    delete process.env.PORT;

    const config = loadConfig();

    expect(config.port).toBe(3001);
  });
});
