import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserIdFromHeadersSDK } from '../lib/api-utils/clerk.js';
import { withRateLimit } from '../lib/api-utils/rateLimitMiddleware.js';
import { handleStoreApiKey } from '../lib/api-utils/shared-handlers.js';
import { initSentry, Sentry } from '../lib/api-utils/sentry.js';

initSentry();

async function handleStoreKey(req: VercelRequest, res: VercelResponse) {
  // Enhanced logging to debug what Vercel provides
  console.log('Store-key request RAW details:', {
    method: req.method,
    url: req.url,
    headers: {
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length'],
      authorization: req.headers.authorization ? 'Bearer token present' : 'No auth header'
    },
    bodyType: typeof req.body,
    bodyValue: req.body,
    bodyStringified: JSON.stringify(req.body),
    bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : 'not an object',
    isBuffer: Buffer.isBuffer(req.body),
    bodyConstructor: req.body?.constructor?.name,
    // Check if body might be in other properties
    reqKeys: Object.keys(req).filter(k => !['headers', 'url', 'method'].includes(k))
  });

  try {
    const userId = await getUserIdFromHeadersSDK(req.headers);
    console.log('Authentication successful, userId:', userId);

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
      console.log('Body is a Buffer, converting to string...');
      const bodyString = body.toString('utf-8');
      try {
        body = JSON.parse(bodyString);
        console.log('Parsed Buffer body:', body);
      } catch (e) {
        console.error('Failed to parse Buffer body:', e, 'Body string:', bodyString);
        throw new Error('Invalid JSON in request body');
      }
    }
    // If body is a string, parse it
    else if (typeof body === 'string') {
      console.log('Body is a string, parsing as JSON...');
      try {
        body = JSON.parse(body);
        console.log('Parsed string body:', body);
      } catch (e) {
        console.error('Failed to parse string body:', e, 'Body string:', body);
        throw new Error('Invalid JSON in request body');
      }
    }

    // Only validate body for POST/PUT/PATCH requests
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      // Check if body exists and is an object
      if (!body || typeof body !== 'object') {
        console.error('Missing or invalid body for POST request:', {
          body,
          bodyType: typeof body,
          method: req.method,
          headers: req.headers,
          reqObjectKeys: Object.keys(req)
        });

        // Send more detailed error to help debug
        Sentry.captureException(new Error('Request body missing'), {
          tags: { operation: 'store_key', errorType: 'missing_body' },
          extra: {
            method: req.method,
            bodyType: typeof req.body,
            bodyValue: req.body,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length']
          }
        });

        throw new Error('Request body is required for POST requests');
      }
    }

    const { apiKey } = body;
    if (!apiKey) {
      console.error('Missing apiKey in body:', {
        body,
        bodyKeys: Object.keys(body),
        bodyStringified: JSON.stringify(body)
      });
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
