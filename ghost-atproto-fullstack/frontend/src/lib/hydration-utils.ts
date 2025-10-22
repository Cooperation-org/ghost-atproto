/**
 * Utility functions to prevent hydration mismatches
 */

import { getRandomUUID } from './crypto-polyfill';

/**
 * Format date consistently for both server and client
 * Uses UTC to avoid timezone differences
 */
export function formatDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    // Use UTC methods to ensure consistency between server and client
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  } catch {
    return '-';
  }
}

/**
 * Format datetime consistently for both server and client
 */
export function formatDateTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    // Use UTC methods to ensure consistency between server and client
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
    });
  } catch {
    return '-';
  }
}

/**
 * Check if we're on the client side
 * Use this instead of typeof window !== 'undefined'
 */
export function isClient(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Get a stable random ID for components
 * Use this instead of Math.random() for IDs
 */
let idCounter = 0;
export function getStableId(): string {
  return `id-${++idCounter}`;
}

/**
 * Get a random UUID using crypto.randomUUID with fallback
 * Use this for generating unique identifiers
 */
export function getRandomId(): string {
  return getRandomUUID();
}

/**
 * Format date for display with consistent locale
 */
export function formatDateForDisplay(dateString: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
      ...options
    };
    
    return date.toLocaleDateString('en-US', defaultOptions);
  } catch {
    return '-';
  }
}
