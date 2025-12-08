/**
 * Tests for error handling utilities
 *
 * File: backend/tests/errors.test.ts
 */

import { ApiError, handleError } from '../src/lib/errors';
import { Response } from 'express';

describe('ApiError', () => {
  it('creates error with all properties', () => {
    const error = new ApiError(400, 'Bad request', 'BAD_REQUEST', { field: 'email' });

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Bad request');
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.details).toEqual({ field: 'email' });
  });

  it('creates badRequest error', () => {
    const error = ApiError.badRequest('Invalid input');

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Invalid input');
    expect(error.code).toBe('BAD_REQUEST');
  });

  it('creates unauthorized error', () => {
    const error = ApiError.unauthorized();

    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Authentication required');
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('creates unauthorized error with custom message', () => {
    const error = ApiError.unauthorized('Session expired');

    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Session expired');
  });

  it('creates forbidden error', () => {
    const error = ApiError.forbidden();

    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Access denied');
    expect(error.code).toBe('FORBIDDEN');
  });

  it('creates notFound error', () => {
    const error = ApiError.notFound('User');

    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('User not found');
    expect(error.code).toBe('NOT_FOUND');
  });

  it('creates conflict error', () => {
    const error = ApiError.conflict('Email already exists');

    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Email already exists');
    expect(error.code).toBe('CONFLICT');
  });

  it('creates validation error with details', () => {
    const error = ApiError.validation('Invalid data', { email: 'required' });

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual({ email: 'required' });
  });

  it('creates internal error', () => {
    const error = ApiError.internal('Database connection failed');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
  });
});

describe('handleError', () => {
  let mockRes: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
  });

  it('handles ApiError correctly', () => {
    const error = ApiError.badRequest('Invalid email');

    handleError(mockRes as Response, error, 'Default message');

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Invalid email',
      code: 'BAD_REQUEST',
    }));
  });

  it('handles generic Error with fallback message', () => {
    const error = new Error('Something broke');

    handleError(mockRes as Response, error, 'Request failed');

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Something broke',
      code: 'INTERNAL_ERROR',
    }));
  });

  it('handles non-Error objects', () => {
    handleError(mockRes as Response, 'string error', 'Fallback message');

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Fallback message',
      code: 'INTERNAL_ERROR',
    }));
  });

  it('includes details from ApiError', () => {
    const error = ApiError.validation('Bad data', { field: 'name' });

    handleError(mockRes as Response, error, 'Default');

    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      details: { field: 'name' },
    }));
  });
});
