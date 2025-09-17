import type { VercelRequest, VercelResponse } from '@vercel/node';
import { activeApiKeys } from './utils/shared.js';
import { getUserIdFromHeaders } from './utils/clerk.js';

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
    const existing = activeApiKeys.get(userId);
    return res.json({ hasKey: !!existing });
  }

  if (req.method === 'POST') {
    const { apiKey } = req.body;

    if (!apiKey || !apiKey.startsWith('sk-')) {
      return res.status(400).json({ error: 'Invalid API key format' });
    }

    activeApiKeys.set(userId, { apiKey, timestamp: Date.now() });
    return res.json({ success: true, message: 'API key stored' });
  }

  if (req.method === 'DELETE') {
    activeApiKeys.delete(userId);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
