import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserIdFromHeaders } from '../lib/api-utils/clerk.js';
import { withRateLimit } from '../lib/api-utils/rateLimitMiddleware.js';
import { handleStoreApiKey } from '../lib/api-utils/shared-handlers.js';
import { initSentry, Sentry } from './utils/sentry.js';

initSentry();

async function handleStoreKey(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getUserIdFromHeaders(req.headers);
    const { apiKey } = req.body;

    const result = await handleStoreApiKey(req.method!, apiKey, userId);
    res.json(result);
  } catch (error: any) {
    console.error('Store key error:', error);
    Sentry.captureException(error, { tags: { operation: 'store_key' } });
    res.status(error.status || 500).json({
      error: error.error || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
}

export default withRateLimit(
  { operationType: 'apiKeyOperations' },
  handleStoreKey
);
