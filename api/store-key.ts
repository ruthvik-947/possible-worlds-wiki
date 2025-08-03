import type { VercelRequest, VercelResponse } from '@vercel/node';
const { activeApiKeys } = require('./utils/shared');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey } = req.body;

  if (!apiKey || !apiKey.startsWith('sk-')) {
    return res.status(400).json({ error: 'Invalid API key format' });
  }

  // Store the API key with a session ID
  const sessionId = Math.random().toString(36).substr(2, 9);
  activeApiKeys.set(sessionId, { apiKey, timestamp: Date.now() });

  res.json({ 
    success: true, 
    sessionId,
    message: 'API key stored' 
  });
}