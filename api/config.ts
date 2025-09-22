import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserIdFromHeadersSDK } from '../lib/api-utils/clerk.js';
import { initSentry, Sentry } from '../lib/api-utils/sentry.js';

initSentry();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await getUserIdFromHeadersSDK(req.headers);
  } catch (error: any) {
    // Log all authentication errors with detailed tags for early-stage monitoring
    Sentry.captureException(error, {
      tags: {
        operation: 'config_auth',
        errorType: 'authentication',
        endpoint: 'config'
      },
      extra: {
        errorMessage: error?.message,
        hasAuthHeader: !!req.headers.authorization
      }
    });
    return res.status(401).json({
      error: 'Unauthorized',
      message: error?.message || 'Authentication required'
    });
  }

  res.json({
    enableUserApiKeys: process.env.ENABLE_USER_API_KEYS === 'true'
  });
}
