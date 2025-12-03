import { describe, it, expect, vi } from 'vitest';
import { insertComment, DbConnection } from '../src/db';

describe('insertComment', () => {
  it('should call execute with correct SQL and parameters', async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const mockDb: DbConnection = {
      execute: mockExecute,
      close: vi.fn(),
    };

    const params = {
      id: '507f1f77bcf86cd799439011',
      postId: '507f1f77bcf86cd799439012',
      memberId: '507f1f77bcf86cd799439013',
      parentId: null,
      html: '<p>Test comment</p>',
      createdAt: '2025-01-15 12:00:00',
    };

    await insertComment(mockDb, params);

    expect(mockExecute).toHaveBeenCalledTimes(1);

    const [sql, sqlParams] = mockExecute.mock.calls[0];

    // Check SQL structure
    expect(sql).toContain('INSERT INTO comments');
    expect(sql).toContain('id, post_id, member_id, parent_id, status, html, created_at, updated_at');

    // Check parameters
    expect(sqlParams[0]).toBe(params.id);
    expect(sqlParams[1]).toBe(params.postId);
    expect(sqlParams[2]).toBe(params.memberId);
    expect(sqlParams[3]).toBe(params.parentId);
    expect(sqlParams[4]).toBe(params.html);
    expect(sqlParams[5]).toBe(params.createdAt);
    // sqlParams[6] is the current timestamp for updated_at
    expect(sqlParams[6]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('should handle parent_id for threaded replies', async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const mockDb: DbConnection = {
      execute: mockExecute,
      close: vi.fn(),
    };

    const params = {
      id: '507f1f77bcf86cd799439011',
      postId: '507f1f77bcf86cd799439012',
      memberId: '507f1f77bcf86cd799439013',
      parentId: '507f1f77bcf86cd799439014',
      html: '<p>Reply to another comment</p>',
      createdAt: '2025-01-15 12:05:00',
    };

    await insertComment(mockDb, params);

    const [, sqlParams] = mockExecute.mock.calls[0];
    expect(sqlParams[3]).toBe('507f1f77bcf86cd799439014');
  });

  it('should propagate database errors', async () => {
    const mockExecute = vi.fn().mockRejectedValue(new Error('Database connection failed'));
    const mockDb: DbConnection = {
      execute: mockExecute,
      close: vi.fn(),
    };

    const params = {
      id: '507f1f77bcf86cd799439011',
      postId: '507f1f77bcf86cd799439012',
      memberId: '507f1f77bcf86cd799439013',
      parentId: null,
      html: '<p>Test</p>',
      createdAt: '2025-01-15 12:00:00',
    };

    await expect(insertComment(mockDb, params)).rejects.toThrow('Database connection failed');
  });
});
