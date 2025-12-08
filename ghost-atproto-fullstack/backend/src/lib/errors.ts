/**
 * Error handling utilities for consistent API responses
 *
 * Usage:
 *   import { ApiError, handleError } from './lib/errors';
 *
 *   // Throw a known error
 *   throw new ApiError(400, 'Invalid email format', 'INVALID_EMAIL');
 *
 *   // In catch block
 *   } catch (error) {
 *     return handleError(res, error, 'Failed to create user');
 *   }
 */

import { Response } from 'express';

// Error codes for frontend to handle programmatically
export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: ErrorCode = 'INTERNAL_ERROR',
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Access denied'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(resource: string): ApiError {
    return new ApiError(404, `${resource} not found`, 'NOT_FOUND');
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message, 'CONFLICT');
  }

  static validation(message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(400, message, 'VALIDATION_ERROR', details);
  }

  static internal(message: string): ApiError {
    return new ApiError(500, message, 'INTERNAL_ERROR');
  }
}

/**
 * Standard error response format
 */
interface ErrorResponse {
  error: string;
  code: ErrorCode;
  details?: Record<string, unknown>;
  stack?: string;
}

/**
 * Handle any error and send appropriate response
 *
 * @param res - Express response object
 * @param error - The caught error
 * @param fallbackMessage - Message to use if error doesn't have one
 * @param logPrefix - Prefix for console.error logging
 */
export function handleError(
  res: Response,
  error: unknown,
  fallbackMessage = 'An unexpected error occurred',
  logPrefix?: string
): Response {
  // Log the full error for debugging
  const prefix = logPrefix ? `[${logPrefix}]` : '[Error]';
  console.error(prefix, error);

  // Build response
  const response: ErrorResponse = {
    error: fallbackMessage,
    code: 'INTERNAL_ERROR',
  };

  let statusCode = 500;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    response.error = error.message;
    response.code = error.code;
    if (error.details) {
      response.details = error.details;
    }
  } else if (error instanceof Error) {
    response.error = error.message || fallbackMessage;
    // Include stack in development
    if (process.env.NODE_ENV !== 'production') {
      response.stack = error.stack;
    }
  }

  return res.status(statusCode).json(response);
}

/**
 * Async route handler wrapper that catches errors
 *
 * Usage:
 *   app.get('/api/users', asyncHandler(async (req, res) => {
 *     const users = await prisma.user.findMany();
 *     res.json(users);
 *   }));
 */
export function asyncHandler<T>(
  fn: (req: T, res: Response) => Promise<unknown>
) {
  return (req: T, res: Response) => {
    Promise.resolve(fn(req, res)).catch((error) => {
      handleError(res, error, 'Request failed');
    });
  };
}
