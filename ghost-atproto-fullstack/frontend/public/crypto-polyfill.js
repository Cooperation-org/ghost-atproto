/**
 * Global crypto polyfill
 * This file should be loaded early to provide crypto.randomUUID polyfill
 */

// Only run in browser environment
if (typeof window !== 'undefined') {
  // Check if crypto.randomUUID is not available
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    console.warn('crypto.randomUUID not available, polyfill will be loaded');
    
    // Create a basic polyfill using Math.random
    // This is a temporary solution until the uuid library is loaded
    if (typeof crypto === 'undefined') {
      (window as any).crypto = {};
    }
    
    if (typeof crypto.randomUUID !== 'function') {
      crypto.randomUUID = function(): string {
        // Simple UUID v4 implementation using Math.random
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };
    }
  }
}
