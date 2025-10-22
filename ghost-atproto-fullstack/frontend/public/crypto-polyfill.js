/**
 * Global crypto polyfill
 * This file should be loaded early to provide crypto.randomUUID polyfill
 */

// Only run in browser environment
if (typeof window !== 'undefined') {
  // Check if crypto.randomUUID is not available
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    console.warn('crypto.randomUUID not available, loading polyfill');
    
    // Create crypto object if it doesn't exist
    if (typeof crypto === 'undefined') {
      window.crypto = {};
    }
    
    // Add randomUUID polyfill if not available
    if (typeof crypto.randomUUID !== 'function') {
      crypto.randomUUID = function() {
        // More robust UUID v4 implementation
        try {
          // Try to use crypto.getRandomValues if available for better randomness
          if (crypto.getRandomValues) {
            const array = new Uint8Array(16);
            crypto.getRandomValues(array);
            
            // Set version (4) and variant bits
            array[6] = (array[6] & 0x0f) | 0x40;
            array[8] = (array[8] & 0x3f) | 0x80;
            
            // Convert to hex string
            const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
            return [
              hex.slice(0, 8),
              hex.slice(8, 12),
              hex.slice(12, 16),
              hex.slice(16, 20),
              hex.slice(20, 32)
            ].join('-');
          }
        } catch (e) {
          console.warn('crypto.getRandomValues failed, falling back to Math.random');
        }
        
        // Fallback to Math.random implementation
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };
      
      console.log('crypto.randomUUID polyfill loaded successfully');
    }
  } else {
    console.log('crypto.randomUUID is available natively');
  }
}
