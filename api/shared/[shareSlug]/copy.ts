import { VercelRequest, VercelResponse } from '@vercel/node';
import { initSentry, Sentry } from '../../../lib/api-utils/sentry.js';
import { handleCopySharedWorld } from '../../../lib/api-utils/shared-handlers.js';
import { getUserIdFromHeaders } from '../../../lib/api-utils/clerk.js';

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

    const { shareSlug } = req.query;
    const { newWorldId } = req.body;

    if (typeof shareSlug !== 'string' || !newWorldId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'shareSlug and newWorldId are required'
      });
    }

    // Get client IP
    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.headers['x-real-ip'] as string
      || req.socket?.remoteAddress
      || 'unknown';

    const copyResult = await handleCopySharedWorld(shareSlug, newWorldId, userId, clientIP);

    res.json(copyResult);

  } catch (error: any) {
    console.error('Copy shared world error:', error);
    Sentry.captureException(error, { tags: { operation: 'copy_shared_world' } });

    res.status(error.status || 500).json({
      error: error.error || 'Failed to copy world',
      message: error.message || 'An error occurred while copying the shared world'
    });
  }
}