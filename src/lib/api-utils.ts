/**
 * Helper function to build API URL without duplicating /api prefix
 */
export function buildApiUrl(endpoint: string): string {
  const baseUrl = import.meta.env.VITE_API_URL || 
    (import.meta.env.DEV ? 'http://localhost:5000' : '');
  
  // Remove trailing slash from base URL
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  
  // If base URL already ends with /api, don't add it again
  if (cleanBaseUrl.endsWith('/api')) {
    // Remove /api from endpoint if it starts with it
    const cleanEndpoint = endpoint.startsWith('/api') ? endpoint.substring(4) : endpoint;
    return `${cleanBaseUrl}${cleanEndpoint}`;
  }
  
  // Otherwise, ensure endpoint starts with /api if needed
  if (!endpoint.startsWith('/api') && !endpoint.startsWith('/')) {
    return `${cleanBaseUrl}/api/${endpoint}`;
  }
  
  return `${cleanBaseUrl}${endpoint}`;
}
