import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGenerateSection } from './shared-handlers.js';
import { getUserIdFromHeaders } from './utils/clerk.js';
import { withRateLimit } from './utils/rateLimitMiddleware.js';

async function handleSectionRequest(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { sectionTitle, pageTitle, pageContent, worldbuildingHistory } = req.body;
  let userId: string;

  try {
    userId = await getUserIdFromHeaders(req.headers);
  } catch (error: any) {
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
    await handleGenerateSection(
      sectionTitle,
      pageTitle,
      pageContent,
      worldbuildingHistory,
      userId,
      ip,
      (data: string) => {
        res.write(data);
      },
      () => res.end()
    );
  } catch (error: any) {
    console.error('Vercel generate-section error:', error);
    if (error.status) {
      res.status(error.status).json({
        error: error.error,
        message: error.message,
        usageCount: error.usageCount,
        dailyLimit: error.dailyLimit,
        requiresApiKey: error.requiresApiKey
      });
    } else {
      res.status(500).json({ error: 'Failed to generate section content' });
    }
  }
}

export default withRateLimit(
  { operationType: 'wikiGeneration' },
  handleSectionRequest
);
