import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserIdFromHeaders } from './utils/clerk.js';
import { storeApiKey, getApiKey, removeApiKey, hasApiKey } from './utils/apiKeyVault.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let userId: string;
  try {
    userId = await getUserIdFromHeaders(req.headers);
  } catch (error: any) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: error?.message || 'Authentication required'
    });
  }

  if (req.method === 'GET') {
    const hasKey = await hasApiKey(userId);
    return res.json({ hasKey });
  }

  if (req.method === 'POST') {
    const { apiKey } = req.body;

    if (!apiKey || !apiKey.startsWith('sk-')) {
      return res.status(400).json({ error: 'Invalid API key format' });
    }

    await storeApiKey(userId, apiKey);
    return res.json({ success: true, message: 'API key stored securely' });
  }

  if (req.method === 'DELETE') {
    await removeApiKey(userId);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
