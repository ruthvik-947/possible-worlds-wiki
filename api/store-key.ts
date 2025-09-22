import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserIdFromHeadersSDK } from '../lib/api-utils/clerk.js';
import { withRateLimit } from '../lib/api-utils/rateLimitMiddleware.js';
import { handleStoreApiKey } from '../lib/api-utils/shared-handlers.js';
import { initSentry, Sentry } from '../lib/api-utils/sentry.js';

initSentry();

async function handleStoreKey(req: VercelRequest, res: VercelResponse) {
  // Enhanced logging for debugging authentication and body parsing
  console.log('Store-key request details:', {
    method: req.method,
    hasAuthHeader: !!req.headers.authorization,
    authHeaderType: typeof req.headers.authorization,
    authHeaderLength: req.headers.authorization?.length,
    contentType: req.headers['content-type'],
    bodyType: typeof req.body,
    bodyValue: req.body,
    hasBody: !!req.body
  });

  try {
    const userId = await getUserIdFromHeadersSDK(req.headers);
    console.log('Authentication successful, userId:', userId);

    // Parse body if it's a string (common in Vercel functions)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
        console.log('Parsed JSON body:', body);
      } catch (parseError) {
        console.error('Failed to parse JSON body:', parseError);
        throw new Error('Invalid JSON in request body');
      }
    }

    // For DELETE requests, body might be empty - that's okay
    if (req.method === 'DELETE') {
      const result = await handleStoreApiKey(req.method!, undefined, userId);
      res.json(result);
      return;
    }

    // For POST requests, body is required
    if (!body || typeof body !== 'object') {
      console.error('Missing or invalid body for POST request:', {
        body,
        bodyType: typeof body,
        method: req.method
      });
      throw new Error('Request body is required for POST requests');
    }

    const { apiKey } = body;
    if (!apiKey) {
      throw new Error('apiKey field is required in request body');
    }

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
