import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserIdFromHeaders } from '../lib/api-utils/clerk.js';
import { initSentry, Sentry } from './utils/sentry.js';

initSentry();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await getUserIdFromHeaders(req.headers);
  } catch (error: any) {
    Sentry.captureException(error, { tags: { operation: 'config_auth' } });
    return res.status(401).json({
      error: 'Unauthorized',
      message: error?.message || 'Authentication required'
    });
  }

  res.json({
    enableUserApiKeys: process.env.ENABLE_USER_API_KEYS === 'true'
  });
}
