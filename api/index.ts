import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { ClerkExpressWithAuth, ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';

// Load environment variables from .env.local first, then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

// Import these AFTER loading environment variables
import { handleGenerate, handleGenerateSection, handleImageGeneration } from './shared-handlers.js';
import { activeApiKeys } from './utils/shared.js';

// Clean up old API keys every hour
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of activeApiKeys.entries()) {
    if (now - data.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
      activeApiKeys.delete(userId);
    }
  }
}, 60 * 60 * 1000); // Check every hour

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
  exposedHeaders: ['x-streaming']
}));
app.use(bodyParser.json());

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error('Missing CLERK_SECRET_KEY environment variable for Clerk authentication');
}

const clerkMiddleware = ClerkExpressWithAuth();

app.use(clerkMiddleware);

// Check if user API keys are enabled
app.get('/api/config', ClerkExpressRequireAuth(), (req: any, res: any) => {
  res.json({
    enableUserApiKeys: process.env.ENABLE_USER_API_KEYS === 'true'
  });
});

// API key storage endpoint (no validation for now)
app.get('/api/store-key', ClerkExpressRequireAuth(), async (req: any, res: any) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const existing = activeApiKeys.get(userId);
  res.json({ hasKey: !!existing });
});

app.post('/api/store-key', ClerkExpressRequireAuth(), async (req: any, res: any) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { apiKey } = req.body;

  if (!apiKey || !apiKey.startsWith('sk-')) {
    return res.status(400).json({ error: 'Invalid API key format' });
  }

  activeApiKeys.set(userId, { apiKey, timestamp: Date.now() });

  res.json({ 
    success: true,
    message: 'API key stored' 
  });
});

app.delete('/api/store-key', ClerkExpressRequireAuth(), async (req: any, res: any) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  activeApiKeys.delete(userId);
  res.json({ success: true });
});

app.post('/api/generate', ClerkExpressRequireAuth(), async (req: any, res: any) => {

  const { input, type, context, worldbuildingHistory } = req.body;
  const userId = req.auth?.userId;

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
      req.ip || 'localhost',
      (data: string) => res.write(data),
      () => res.end()
    );
  } catch (error: any) {
    console.error('Express: Error:', error);
    // Don't send JSON if we've already started streaming
    if (!res.headersSent) {
      res.status(error.status || 500).json({
        error: error.error || 'Failed to generate wiki page',
        message: error.message,
        usageCount: error.usageCount,
        dailyLimit: error.dailyLimit,
        requiresApiKey: error.requiresApiKey
      });
    } else {
      // If headers are already sent, write error as SSE
      res.write('data: ' + JSON.stringify({ error: error.message || 'An error occurred' }) + '\n\n');
      res.end();
    }
  }
});

app.post('/api/generate-section', ClerkExpressRequireAuth(), async (req: any, res: any) => {

  const { sectionTitle, pageTitle, pageContent, worldbuildingHistory } = req.body;
  const userId = req.auth?.userId;

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
      req.ip || 'localhost',
      (data: string) => res.write(data), // writeData callback
      () => res.end() // endResponse callback
    );
  } catch (error: any) {
    console.error('Express: Section error:', error);
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
});

app.post('/api/generate-image', ClerkExpressRequireAuth(), async (req: any, res: any) => {

  const { pageTitle, pageContent, worldbuildingHistory } = req.body;
  const userId = req.auth?.userId;

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
      req.ip || 'localhost',
      (data: string) => res.write(data), // writeData callback
      () => res.end() // endResponse callback
    );
  } catch (error: any) {
    console.error('Express: Image generation error:', error);
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
});


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
