import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserIdFromHeadersSDK } from '../lib/api-utils/clerk.js';
import { withRateLimit } from '../lib/api-utils/rateLimitMiddleware.js';
import { listWorldsAuth, saveWorldAuth } from '../lib/api-utils/worldsAuth.js';
import { initSentry, Sentry } from '../lib/api-utils/sentry.js';

initSentry();

async function handleWorldsRequest(req: VercelRequest, res: VercelResponse) {
  let userId: string;

  try {
    userId = await getUserIdFromHeadersSDK(req.headers);
  } catch (error: any) {
    Sentry.captureException(error, {
      tags: {
        operation: 'worlds_auth',
        errorType: 'authentication',
        endpoint: 'worlds'
      },
      extra: {
        errorMessage: error?.message,
        hasAuthHeader: !!req.headers.authorization
      }
    });
    res.status(401).json({
      error: 'Unauthorized',
      message: error?.message || 'Authentication required'
    });
    return;
  }

  if (req.method === 'GET') {
    try {
      // Use RLS-enabled function that authenticates via Clerk JWT
      const worlds = await listWorldsAuth(req.headers);
      res.json(worlds);
    } catch (error) {
      console.error('Failed to list worlds:', error);
      Sentry.captureException(error, { tags: { operation: 'list_worlds' } });
      res.status(500).json({ error: 'Failed to load worlds' });
    }
  } else if (req.method === 'POST') {
    const { world } = req.body;

    if (!world || typeof world !== 'object') {
      return res.status(400).json({ error: 'Missing world payload' });
    }

    try {
      // Use RLS-enabled function that authenticates via Clerk JWT
      const summary = await saveWorldAuth(req.headers, userId, world);
      res.json(summary);
    } catch (error: any) {
      console.error('Failed to save world:', error);
      Sentry.captureException(error, { tags: { operation: 'save_world' } });
      res.status(500).json({ error: error?.message || 'Failed to save world' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default withRateLimit(
  { operationType: 'worldOperations' },
  handleWorldsRequest
);