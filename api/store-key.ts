import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserIdFromHeadersSDK } from '../lib/api-utils/clerk.js';
import { withRateLimit } from '../lib/api-utils/rateLimitMiddleware.js';
import { handleStoreApiKey } from '../lib/api-utils/shared-handlers.js';
import { initSentry, Sentry } from '../lib/api-utils/sentry.js';

initSentry();

async function handleStoreKey(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await getUserIdFromHeadersSDK(req.headers);

    // Handle GET requests - check if user has an API key
    if (req.method === 'GET') {
      const result = await handleStoreApiKey('GET', undefined, userId);
      res.json(result);
      return;
    }

    // Handle DELETE requests
    if (req.method === 'DELETE') {
      const result = await handleStoreApiKey('DELETE', undefined, userId);
      res.json(result);
      return;
    }

    // For POST requests, handle different body formats
    let body = req.body;

    // If body is a Buffer, convert it to string and parse
    if (Buffer.isBuffer(body)) {
      const bodyString = body.toString('utf-8');
      try {
        body = JSON.parse(bodyString);
      } catch (e) {
        throw new Error('Invalid JSON in request body');
      }
    }
    // If body is a string, parse it
    else if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        throw new Error('Invalid JSON in request body');
      }
    }

    // Only validate body for POST/PUT/PATCH requests
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      // Check if body exists and is an object
      if (!body || typeof body !== 'object') {
        Sentry.captureException(new Error('Request body missing'), {
          tags: { operation: 'store_key', errorType: 'missing_body' },
          extra: {
            method: req.method,
            bodyType: typeof req.body,
            contentType: req.headers['content-type']
          }
        });

        throw new Error('Request body is required for POST requests');
      }
    }

    const { apiKey } = body;
    if (!apiKey) {
      throw new Error('apiKey field is required in request body');
    }

    const result = await handleStoreApiKey(req.method!, apiKey, userId);
    res.json(result);
  } catch (error: any) {
    const isAuthError = error?.message?.includes('Authentication failed') || error?.message?.includes('not authenticated');
    Sentry.captureException(error, {
      tags: {
        operation: 'store_key',
        errorType: isAuthError ? 'authentication' : 'other',
        endpoint: 'store-key'
      },
      extra: {
        errorMessage: error?.message,
        hasAuthHeader: !!req.headers.authorization
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
