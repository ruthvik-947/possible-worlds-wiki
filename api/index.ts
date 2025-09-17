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
import { storeApiKey, getApiKey, removeApiKey, hasApiKey } from './utils/apiKeyStorage.js';
import { listWorlds, saveWorld, getWorld, deleteWorld } from './utils/worlds.js';
import { getFreeLimit } from './utils/shared.js';
import { getUsageForUser } from './utils/quota.js';

// API key cleanup is now handled in apiKeyStorage.ts with Redis TTL

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

// Usage endpoint - get current usage for user
app.get('/api/usage', ClerkExpressRequireAuth(), async (req: any, res: any) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Check if user has API key
    const hasUserApiKey = await hasApiKey(userId);

    if (hasUserApiKey) {
      res.json({
        hasUserApiKey: true,
        usageCount: 0,
        dailyLimit: 0,
        remaining: 0,
        unlimited: true
      });
    } else {
      const usage = await getUsageForUser(userId);
      const dailyLimit = getFreeLimit();
      res.json({
        hasUserApiKey: false,
        usageCount: usage.count,
        dailyLimit,
        remaining: Math.max(0, dailyLimit - usage.count),
        unlimited: false
      });
    }
  } catch (error) {
    console.error('Failed to get usage:', error);
    res.status(500).json({ error: 'Failed to get usage information' });
  }
});

// API key storage endpoint (no validation for now)
app.get('/api/store-key', ClerkExpressRequireAuth(), async (req: any, res: any) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const hasKey = await hasApiKey(userId);
  res.json({ hasKey });
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

  await storeApiKey(userId, apiKey);

  res.json({
    success: true,
    message: 'API key stored securely'
  });
});

app.delete('/api/store-key', ClerkExpressRequireAuth(), async (req: any, res: any) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await removeApiKey(userId);
  res.json({ success: true });
});

app.get('/api/worlds', ClerkExpressRequireAuth(), async (req: any, res: any) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const worlds = await listWorlds(userId);
    res.json(worlds);
  } catch (error) {
    console.error('Failed to list worlds:', error);
    res.status(500).json({ error: 'Failed to load worlds' });
  }
});

app.get('/api/worlds/:worldId', ClerkExpressRequireAuth(), async (req: any, res: any) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { worldId } = req.params;

  try {
    const record = await getWorld(userId, worldId);
    if (!record) {
      return res.status(404).json({ error: 'World not found' });
    }

    res.json(record);
  } catch (error) {
    console.error('Failed to get world:', error);
    res.status(500).json({ error: 'Failed to load world' });
  }
});

app.post('/api/worlds', ClerkExpressRequireAuth(), async (req: any, res: any) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { world } = req.body;

  if (!world || typeof world !== 'object') {
    return res.status(400).json({ error: 'Missing world payload' });
  }

  try {
    const summary = await saveWorld(userId, world);
    res.json(summary);
  } catch (error: any) {
    console.error('Failed to save world:', error);
    res.status(500).json({ error: error?.message || 'Failed to save world' });
  }
});

app.delete('/api/worlds/:worldId', ClerkExpressRequireAuth(), async (req: any, res: any) => {
  const userId = req.auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { worldId } = req.params;

  try {
    const deleted = await deleteWorld(userId, worldId);
    if (!deleted) {
      return res.status(404).json({ error: 'World not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete world:', error);
    res.status(500).json({ error: 'Failed to delete world' });
  }
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
