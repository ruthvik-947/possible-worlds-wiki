import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFreeLimit } from './utils/shared.js';
import { getUsageForUser } from './utils/quota.js';
import { getUserIdFromHeaders } from './utils/clerk.js';
import { hasApiKey } from './utils/apiKeyStorage.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let userId: string;

  try {
    userId = await getUserIdFromHeaders(req.headers);
  } catch (error: any) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: error?.message || 'Authentication required'
    });
  }

  // Check if user has API key
  const hasUserApiKey = await hasApiKey(userId);

  if (hasUserApiKey) {
    res.json({
      hasUserApiKey: true,
      usageCount: 0,
      dailyLimit: 0,
      remaining: 0,
      unlimited: true
    });
  } else {
    const usage = await getUsageForUser(userId);
    const dailyLimit = getFreeLimit();
    res.json({
      hasUserApiKey: false,
      usageCount: usage.count,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - usage.count),
      unlimited: false
    });
  }
}
