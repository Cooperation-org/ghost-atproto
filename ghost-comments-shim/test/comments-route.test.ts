import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createCommentsRouter } from '../src/routes/comments';
import { Config } from '../src/config';
import { DbConnection } from '../src/db';

// Mock database connection
function createMockDb(): DbConnection {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// Test configuration
const testConfig: Config = {
  ghostDbType: 'sqlite',
  ghostDbConnection: ':memory:',
  bridgeSharedSecret: 'test-secret-key-min-32-characters-long',
  blueskyMemberId: '507f1f77bcf86cd799439011',
  port: 3001,
};

describe('POST /comments', () => {
  let app: express.Application;
  let mockDb: DbConnection;

  beforeEach(() => {
    mockDb = createMockDb();
    app = express();
    app.use(express.json());
    app.use('/comments', createCommentsRouter(testConfig, mockDb));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should reject missing auth header', async () => {
    const response = await request(app)
      .post('/comments')
      .send({
        post_id: '507f1f77bcf86cd799439011',
        bsky_handle: 'alice.bsky.social',
        bsky_profile_url: 'https://bsky.app/profile/alice.bsky.social',
        bsky_post_url: 'https://bsky.app/profile/alice.bsky.social/post/abc',
        comment_text: 'Test comment',
        parent_comment_id: null,
        created_at: '2025-01-15T12:00:00Z',
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Missing or invalid authorization header');
  });

  it('should reject invalid auth token', async () => {
    const response = await request(app)
      .post('/comments')
      .set('Authorization', 'Bearer wrong-token')
      .send({
        post_id: '507f1f77bcf86cd799439011',
        bsky_handle: 'alice.bsky.social',
        bsky_profile_url: 'https://bsky.app/profile/alice.bsky.social',
        bsky_post_url: 'https://bsky.app/profile/alice.bsky.social/post/abc',
        comment_text: 'Test comment',
        parent_comment_id: null,
        created_at: '2025-01-15T12:00:00Z',
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid authorization token');
  });

  it('should reject invalid post_id format', async () => {
    const response = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${testConfig.bridgeSharedSecret}`)
      .send({
        post_id: 'invalid-id',
        bsky_handle: 'alice.bsky.social',
        bsky_profile_url: 'https://bsky.app/profile/alice.bsky.social',
        bsky_post_url: 'https://bsky.app/profile/alice.bsky.social/post/abc',
        comment_text: 'Test comment',
        parent_comment_id: null,
        created_at: '2025-01-15T12:00:00Z',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('post_id must be a valid Ghost ID');
  });

  it('should reject missing required fields', async () => {
    const response = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${testConfig.bridgeSharedSecret}`)
      .send({
        post_id: '507f1f77bcf86cd799439011',
        // missing other required fields
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('bsky_handle is required');
  });

  it('should reject invalid URL protocol', async () => {
    const response = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${testConfig.bridgeSharedSecret}`)
      .send({
        post_id: '507f1f77bcf86cd799439011',
        bsky_handle: 'alice.bsky.social',
        bsky_profile_url: 'javascript:alert(1)',
        bsky_post_url: 'https://bsky.app/profile/alice.bsky.social/post/abc',
        comment_text: 'Test comment',
        parent_comment_id: null,
        created_at: '2025-01-15T12:00:00Z',
      });

    expect(response.status).toBe(500);
  });

  it('should create comment with valid input', async () => {
    const response = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${testConfig.bridgeSharedSecret}`)
      .send({
        post_id: '507f1f77bcf86cd799439011',
        bsky_handle: 'alice.bsky.social',
        bsky_profile_url: 'https://bsky.app/profile/alice.bsky.social',
        bsky_post_url: 'https://bsky.app/profile/alice.bsky.social/post/abc',
        comment_text: 'Test comment',
        parent_comment_id: null,
        created_at: '2025-01-15T12:00:00Z',
      });

    expect(response.status).toBe(201);
    expect(response.body.comment_id).toBeDefined();
    expect(response.body.comment_id).toHaveLength(24);
    expect(mockDb.execute).toHaveBeenCalled();
  });

  it('should handle parent_comment_id for replies', async () => {
    const parentId = '507f1f77bcf86cd799439012';

    const response = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${testConfig.bridgeSharedSecret}`)
      .send({
        post_id: '507f1f77bcf86cd799439011',
        bsky_handle: 'bob.bsky.social',
        bsky_profile_url: 'https://bsky.app/profile/bob.bsky.social',
        bsky_post_url: 'https://bsky.app/profile/bob.bsky.social/post/def',
        comment_text: 'This is a reply',
        parent_comment_id: parentId,
        created_at: '2025-01-15T12:05:00Z',
      });

    expect(response.status).toBe(201);
    expect(response.body.comment_id).toBeDefined();

    // Verify the execute was called with parent_id
    const executeCall = (mockDb.execute as any).mock.calls[0];
    expect(executeCall[1]).toContain(parentId);
  });

  it('should reject invalid parent_comment_id format', async () => {
    const response = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${testConfig.bridgeSharedSecret}`)
      .send({
        post_id: '507f1f77bcf86cd799439011',
        bsky_handle: 'alice.bsky.social',
        bsky_profile_url: 'https://bsky.app/profile/alice.bsky.social',
        bsky_post_url: 'https://bsky.app/profile/alice.bsky.social/post/abc',
        comment_text: 'Test comment',
        parent_comment_id: 'invalid-parent-id',
        created_at: '2025-01-15T12:00:00Z',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('parent_comment_id must be a valid Ghost ID');
  });

  it('should escape XSS in comment text', async () => {
    const response = await request(app)
      .post('/comments')
      .set('Authorization', `Bearer ${testConfig.bridgeSharedSecret}`)
      .send({
        post_id: '507f1f77bcf86cd799439011',
        bsky_handle: 'alice.bsky.social',
        bsky_profile_url: 'https://bsky.app/profile/alice.bsky.social',
        bsky_post_url: 'https://bsky.app/profile/alice.bsky.social/post/abc',
        comment_text: '<script>alert("xss")</script>',
        parent_comment_id: null,
        created_at: '2025-01-15T12:00:00Z',
      });

    expect(response.status).toBe(201);

    // Verify the HTML in the execute call is escaped
    const executeCall = (mockDb.execute as any).mock.calls[0];
    const htmlParam = executeCall[1][4]; // html is the 5th parameter
    expect(htmlParam).not.toContain('<script>');
    expect(htmlParam).toContain('&lt;script&gt;');
  });
});
