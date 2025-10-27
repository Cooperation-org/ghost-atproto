/**
 * Navigation utilities to handle basePath consistently
 * Works with both local (no basePath) and production (/bridge basePath)
 */

// Get the basePath from the environment
export const getBasePath = (): string => {
  return process.env.NEXT_PUBLIC_BASE_PATH || '';
};

// Get the full URL with basePath prefix
export const getFullPath = (path: string): string => {
  const basePath = getBasePath();
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  // Combine basePath with path, avoiding double slashes
  return basePath ? `${basePath}${cleanPath}` : cleanPath;
};

// Navigate to a path (works with window.location)
export const navigateTo = (path: string): void => {
  window.location.href = getFullPath(path);
};

// Get the API base URL
export const getApiBaseUrl = (): string => {
  return process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5001';
};

