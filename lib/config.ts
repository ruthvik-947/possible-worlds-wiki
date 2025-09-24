// API configuration based on environment
const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : '');

export const config = {
  apiUrl: API_BASE_URL,
  endpoints: {
    config: `${API_BASE_URL}/api/config`,
    generate: `${API_BASE_URL}/api/generate`,
    generateSection: `${API_BASE_URL}/api/generate-section`,
    generateImage: `${API_BASE_URL}/api/generate-image`,
    usage: `${API_BASE_URL}/api/usage`,
    storeKey: `${API_BASE_URL}/api/store-key`,
    worlds: `${API_BASE_URL}/api/worlds`,
    shared: `${API_BASE_URL}/api/shared`
  }
};
