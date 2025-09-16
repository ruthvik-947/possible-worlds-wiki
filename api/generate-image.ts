import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleImageGeneration } from './shared-handlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { pageTitle, pageContent, worldbuildingHistory, sessionId } = req.body;

  // Get client IP for rate limiting
  const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || 'unknown';
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
      sessionId,
      ip,
      (data: string) => {
        res.write(data);
        res.flush?.(); // Force flush if available
      },
      () => res.end()
    );
  } catch (error: any) {
    console.error('Vercel image generation error:', error);
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