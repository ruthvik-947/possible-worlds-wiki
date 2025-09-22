import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGenerate } from '../lib/api-utils/shared-handlers.js';
import { getUserIdFromHeadersSDK } from '../lib/api-utils/clerk.js';
import { withRateLimit } from '../lib/api-utils/rateLimitMiddleware.js';
import { initSentry, Sentry } from '../lib/api-utils/sentry.js';

initSentry();

async function handleGenerateRequest(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { input, type, context, worldbuildingHistory } = req.body;
  let userId: string;

  try {
    userId = await getUserIdFromHeadersSDK(req.headers);
  } catch (error: any) {
    // Log all authentication errors with detailed tags for early-stage monitoring
    Sentry.captureException(error, {
      tags: {
        operation: 'generate_auth',
        errorType: 'authentication',
        endpoint: 'generate'
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

  // Get client IP for rate limiting
  const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
  const ip = Array.isArray(clientIP) ? clientIP[0] : clientIP;

  // Set up streaming response headers
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Streaming', 'true');

  try {
    await handleGenerate(
      input,
      type,
      context,
      worldbuildingHistory,
      userId,
      ip,
      (data: string) => {
        res.write(data);
      },
      () => res.end()
    );
  } catch (error: any) {
    console.error('Vercel generate error:', error);
    Sentry.captureException(error, { tags: { operation: 'generate_wiki' } });
    if (error.status) {
      res.status(error.status).json({
        error: error.error,
        message: error.message,
        usageCount: error.usageCount,
        dailyLimit: error.dailyLimit,
        requiresApiKey: error.requiresApiKey
      });
    } else {
      res.status(500).json({ error: 'Failed to generate wiki page' });
    }
  }
}

export default withRateLimit(
  { operationType: 'wikiGeneration' },
  handleGenerateRequest
);
