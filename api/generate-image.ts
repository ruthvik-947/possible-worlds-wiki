import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleImageGeneration } from '../lib/api-utils/shared-handlers.js';
import { getUserIdFromHeaders } from '../lib/api-utils/clerk.js';
import { withRateLimit } from '../lib/api-utils/rateLimitMiddleware.js';
import { initSentry, Sentry } from './utils/sentry.js';

initSentry();

async function handleImageRequest(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { pageTitle, pageContent, worldbuildingHistory, worldId, pageId } = req.body;
  let userId: string;

  try {
    userId = await getUserIdFromHeaders(req.headers);
  } catch (error: any) {
    Sentry.captureException(error, { tags: { operation: 'generate_image_auth' } });
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
    await handleImageGeneration(
      pageTitle,
      pageContent,
      worldbuildingHistory,
      userId,
      ip,
      (data: string) => {
        res.write(data);
      },
      () => res.end(),
      worldId,
      pageId
    );
  } catch (error: any) {
    console.error('Vercel image generation error:', error);
    Sentry.captureException(error, { tags: { operation: 'generate_image' } });
    if (error.status) {
      res.status(error.status).json({
        error: error.error,
        message: error.message,
        usageCount: error.usageCount,
        dailyLimit: error.dailyLimit,
        requiresApiKey: error.requiresApiKey
      });
    } else {
      res.status(500).json({ error: 'Failed to generate image' });
    }
  }
}

export default withRateLimit(
  { operationType: 'imageGeneration' },
  handleImageRequest
);
