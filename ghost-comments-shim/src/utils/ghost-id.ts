import crypto from 'crypto';

/**
 * Generate a Ghost-compatible ID (24-character hex string, MongoDB ObjectId style)
 */
export function generateGhostId(): string {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * Validate a Ghost ID format
 */
export function isValidGhostId(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(id);
}
