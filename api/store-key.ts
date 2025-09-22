import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserIdFromHeadersSDK } from '../lib/api-utils/clerk.js';
import { withRateLimit } from '../lib/api-utils/rateLimitMiddleware.js';
import { handleStoreApiKey } from '../lib/api-utils/shared-handlers.js';
import { initSentry, Sentry } from '../lib/api-utils/sentry.js';

initSentry();

async function handleStoreKey(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getUserIdFromHeadersSDK(req.headers);

    // Parse body if it's a string (common in Vercel functions)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        throw new Error('Invalid JSON in request body');
      }
    }

    if (!body || typeof body !== 'object') {
      throw new Error('Request body is required');
    }

    const { apiKey } = body;

    const result = await handleStoreApiKey(req.method!, apiKey, userId);
    res.json(result);
  } catch (error: any) {
    console.error('Store key error:', error);
    // Log all errors with enhanced tags for early-stage monitoring
    const isAuthError = error?.message?.includes('Authentication failed') || error?.message?.includes('not authenticated');
    Sentry.captureException(error, {
      tags: {
        operation: 'store_key',
        errorType: isAuthError ? 'authentication' : 'other',
        endpoint: 'store-key'
      },
      extra: {
        errorMessage: error?.message,
        hasAuthHeader: !!req.headers.authorization,
        requestMethod: req.method
      }
    });
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
