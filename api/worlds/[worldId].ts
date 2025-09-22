iimport type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserIdFromHeadersSDK } from '../../lib/api-utils/clerk.js';
import { withRateLimit } from '../../lib/api-utils/rateLimitMiddleware.js';
import { getWorldAuth, deleteWorldAuth } from '../../lib/api-utils/worldsAuth.js';
import { initSentry, Sentry } from '../../lib/api-utils/sentry.js';

initSentry();

async function handleWorldRequest(req: VercelRequest, res: VercelResponse) {
  let userId: string;

  try {
    userId = await getUserIdFromHeadersSDK(req.headers);
  } catch (error: any) {
    Sentry.captureException(error, {
      tags: {
        operation: 'world_auth',
        errorType: 'authentication',
        endpoint: 'worlds/[worldId]'
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

  const { worldId } = req.query;

  if (!worldId || typeof worldId !== 'string') {
    return res.status(400).json({ error: 'Missing worldId parameter' });
  }

  if (req.method === 'GET') {
    try {
      // Use RLS-enabled function that authenticates via Clerk JWT
      const record = await getWorldAuth(req.headers, worldId);
      if (!record) {
        return res.status(404).json({ error: 'World not found' });
      }

      res.json(record);
    } catch (error) {
      console.error('Failed to get world:', error);
      Sentry.captureException(error, { tags: { operation: 'get_world' } });
      res.status(500).json({ error: 'Failed to load world' });
    }
  } else if (req.method === 'DELETE') {
    try {
      // Use RLS-enabled function that authenticates via Clerk JWT
      const deleted = await deleteWorldAuth(req.headers, worldId);
      if (!deleted) {
        return res.status(404).json({ error: 'World not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete world:', error);
      Sentry.captureException(error, { tags: { operation: 'delete_world' } });
      res.status(500).json({ error: 'Failed to delete world' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default withRateLimit(
  { operationType: 'worldOperations' },
  handleWorldRequest
);