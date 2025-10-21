/**
 * Crypto polyfill utilities
 * Provides fallback implementations for crypto APIs that may not be available in all browsers
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Polyfill for crypto.randomUUID()
 * Falls back to uuid library if crypto.randomUUID is not available
 */
export function randomUUID(): string {
  // Check if crypto.randomUUID is available (requires secure context)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (error) {
      // Fall back to uuid library if crypto.randomUUID fails
      console.warn('crypto.randomUUID failed, falling back to uuid library:', error);
    }
  }
  
  // Fallback to uuid library
  return uuidv4();
}

/**
 * Check if crypto.randomUUID is available in the current environment
 */
export function isCryptoRandomUUIDAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
}

/**
 * Get a random UUID with proper fallback
 * This is the recommended function to use instead of crypto.randomUUID directly
 */
export function getRandomUUID(): string {
  return randomUUID();
}
