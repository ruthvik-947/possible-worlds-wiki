import { VercelRequest, VercelResponse } from '@vercel/node';
import { initSentry, Sentry } from '../../lib/api-utils/sentry.js';
import { handleGetSharedWorld } from '../../lib/api-utils/shared-handlers.js';
import { getUserIdFromHeaders } from '../../lib/api-utils/clerk.js';

// Initialize Sentry for this Vercel function
initSentry();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { shareSlug } = req.query;

    if (typeof shareSlug !== 'string') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'shareSlug parameter is required'
      });
    }

    // Extract userId from Clerk JWT (optional for this endpoint)
    let userId: string | undefined;
    try {
      userId = await getUserIdFromHeaders(req.headers);
    } catch (error) {
      // Authentication optional for this endpoint, so we continue without userId
      console.log('No authentication provided for shared world access (optional)');
    }

    // Get client IP
    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.headers['x-real-ip'] as string
      || req.socket?.remoteAddress
      || 'unknown';

    const sharedWorldData = await handleGetSharedWorld(shareSlug, clientIP, userId);

    res.json(sharedWorldData);

  } catch (error: any) {
    console.error('Get shared world error:', error);
    Sentry.captureException(error, { tags: { operation: 'get_shared_world' } });

    res.status(error.status || 500).json({
      error: error.error || 'Failed to fetch shared world',
      message: error.message || 'An error occurred while loading the shared world'
    });
  }
}