import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUsageForIP, FREE_TIER_DAILY_LIMIT, activeApiKeys } from './utils/shared.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get client IP
  const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || 'unknown';
  const ip = Array.isArray(clientIP) ? clientIP[0] : clientIP;

  // Check if user has API key
  const { sessionId } = req.query;
  const sessionData = sessionId ? activeApiKeys.get(sessionId as string) : null;
  const hasUserApiKey = !!sessionData?.apiKey;

  if (hasUserApiKey) {
    res.json({
      hasUserApiKey: true,
      usageCount: 0,
      dailyLimit: 0,
      remaining: 0,
      unlimited: true
    });
  } else {
    const usage = getUsageForIP(ip);
    res.json({
      hasUserApiKey: false,
      usageCount: usage.count,
      dailyLimit: FREE_TIER_DAILY_LIMIT,
      remaining: Math.max(0, FREE_TIER_DAILY_LIMIT - usage.count),
      unlimited: false
    });
  }
}