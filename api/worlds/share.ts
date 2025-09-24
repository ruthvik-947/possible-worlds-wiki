import { VercelRequest, VercelResponse } from '@vercel/node';
import { initSentry, Sentry } from '../../lib/api-utils/sentry.js';
import { handleShareWorld } from '../../lib/api-utils/shared-handlers.js';
import { getUserIdFromHeaders } from '../../lib/api-utils/clerk.js';

// Initialize Sentry for this Vercel function
initSentry();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract userId from Clerk JWT
    let userId: string;
    try {
      userId = await getUserIdFromHeaders(req.headers);
    } catch (error) {
      console.error('Authentication failed:', error);
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing authentication' });
    }

    const { worldId, worldSnapshot, expiresAt } = req.body;

    if (!worldId || !worldSnapshot) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'worldId and worldSnapshot are required'
      });
    }

    // Get client IP
    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.headers['x-real-ip'] as string
      || req.socket?.remoteAddress
      || 'unknown';

    // Set up streaming response headers
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Streaming', 'true');

    await handleShareWorld(
      worldId,
      worldSnapshot,
      userId,
      expiresAt,
      clientIP,
      (data) => res.write(data),
      () => res.end()
    );

  } catch (error: any) {
    console.error('Share world error:', error);
    Sentry.captureException(error, { tags: { operation: 'share_world' } });

    if (!res.writableEnded) {
      if (!res.headersSent) {
        res.status(error.status || 500).json({
          error: error.error || 'Failed to share world',
          message: error.message || 'An error occurred while sharing the world'
        });
      } else {
        res.write('data: ' + JSON.stringify({
          status: 'error',
          error: error.error || 'Failed to share world',
          message: error.message || 'An error occurred while sharing the world'
        }) + '\n\n');
        res.end();
      }
    }
  }
}