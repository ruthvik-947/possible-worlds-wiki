import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import helmet from 'helmet';
import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import { clerkMiddleware, requireAuth } from '@clerk/express';
import { createRateLimitMiddleware } from '../lib/api-utils/rateLimitMiddleware.js';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Initialize Sentry (only in production)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [],
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
    enableLogs: true, // Capture console errors automatically
    beforeSend(event) {
      // Don't send API key validation errors to reduce noise
      if (event.exception?.values?.[0]?.value?.includes('API key')) {
        return null;
      }
      return event;
    }
  });
}

// Import these AFTER loading environment variables
import { handleGenerate, handleGenerateSection, handleImageGeneration, handleStoreApiKey } from '../lib/api-utils/shared-handlers.js';
import { hasApiKey } from '../lib/api-utils/apiKeyVault.js';
// Removed: Using worldsAuth.ts functions instead
import { listWorldsAuth, saveWorldAuth, getWorldAuth, deleteWorldAuth, testRLSIntegration } from '../lib/api-utils/worldsAuth.js';
import { getFreeLimit } from '../lib/api-utils/shared.js';
import { getUsageForUser } from '../lib/api-utils/quota.js';

// API key cleanup is now handled automatically by Supabase Vault TTL

const app = express();
const port = process.env.PORT || 3001;

// Add Sentry request handler middleware
// Note: In Sentry v8, request/error handlers are set up differently

// Add security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https://clerk.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.openai.com", "https://clerk.com"],
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false // Disable COEP for compatibility
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  exposedHeaders: ['x-streaming']
}));
app.use(bodyParser.json());

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error('Missing CLERK_SECRET_KEY environment variable for Clerk authentication');
}

app.use(clerkMiddleware());

// Rate limiting middleware definitions
const wikiRateLimit = createRateLimitMiddleware({
  operationType: 'wikiGeneration',
  getUserId: (req) => req.auth()?.userId
});

const imageRateLimit = createRateLimitMiddleware({
  operationType: 'imageGeneration',
  getUserId: (req) => req.auth()?.userId
});

const worldRateLimit = createRateLimitMiddleware({
  operationType: 'worldOperations',
  getUserId: (req) => req.auth()?.userId
});

const apiKeyRateLimit = createRateLimitMiddleware({
  operationType: 'apiKeyOperations',
  getUserId: (req) => req.auth()?.userId
});

const globalRateLimit = createRateLimitMiddleware({
  operationType: 'global',
  getUserId: (req) => req.auth()?.userId
});

// Check if user API keys are enabled
app.get('/api/config', globalRateLimit, requireAuth(), (req: any, res: any) => {
  res.json({
    enableUserApiKeys: process.env.ENABLE_USER_API_KEYS === 'true'
  });
});

// Usage endpoint - get current usage for user
app.get('/api/usage', globalRateLimit, requireAuth(), async (req: any, res: any) => {
  const userId = req.auth()?.userId;
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
    Sentry.captureException(error, { tags: { operation: 'get_usage' } });
    res.status(500).json({ error: 'Failed to get usage information' });
  }
});

// API key storage endpoints using shared handler
app.get('/api/store-key', apiKeyRateLimit, requireAuth(), async (req: any, res: any) => {
  try {
    const result = await handleStoreApiKey('GET', undefined, req.auth()?.userId);
    res.json(result);
  } catch (error: any) {
    Sentry.captureException(error, { tags: { operation: 'store_key_get' } });
    res.status(error.status || 500).json({
      error: error.error || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

app.post('/api/store-key', apiKeyRateLimit, requireAuth(), async (req: any, res: any) => {
  try {
    const { apiKey } = req.body;
    const result = await handleStoreApiKey('POST', apiKey, req.auth()?.userId);
    res.json(result);
  } catch (error: any) {
    Sentry.captureException(error, { tags: { operation: 'store_key_post' } });
    res.status(error.status || 500).json({
      error: error.error || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

app.delete('/api/store-key', apiKeyRateLimit, requireAuth(), async (req: any, res: any) => {
  try {
    const result = await handleStoreApiKey('DELETE', undefined, req.auth()?.userId);
    res.json(result);
  } catch (error: any) {
    Sentry.captureException(error, { tags: { operation: 'store_key_delete' } });
    res.status(error.status || 500).json({
      error: error.error || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

app.get('/api/worlds', worldRateLimit, requireAuth(), async (req: any, res: any) => {
  const userId = req.auth()?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Use RLS-enabled function that authenticates via Clerk JWT
    const worlds = await listWorldsAuth(req.headers);
    res.json(worlds);
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'list_worlds' } });
    res.status(500).json({ error: 'Failed to load worlds' });
  }
});

app.get('/api/worlds/:worldId', worldRateLimit, requireAuth(), async (req: any, res: any) => {
  const userId = req.auth()?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { worldId } = req.params;

  try {
    // Use RLS-enabled function that authenticates via Clerk JWT
    const record = await getWorldAuth(req.headers, worldId);
    if (!record) {
      return res.status(404).json({ error: 'World not found' });
    }

    res.json(record);
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'get_world' } });
    res.status(500).json({ error: 'Failed to load world' });
  }
});

app.post('/api/worlds', worldRateLimit, requireAuth(), async (req: any, res: any) => {
  const userId = req.auth()?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { world } = req.body;

  if (!world || typeof world !== 'object') {
    return res.status(400).json({ error: 'Missing world payload' });
  }

  try {
    // Use RLS-enabled function that authenticates via Clerk JWT
    const summary = await saveWorldAuth(req.headers, userId, world);
    res.json(summary);
  } catch (error: any) {
    Sentry.captureException(error, { tags: { operation: 'save_world' } });
    res.status(500).json({ error: error?.message || 'Failed to save world' });
  }
});

app.delete('/api/worlds/:worldId', worldRateLimit, requireAuth(), async (req: any, res: any) => {
  const userId = req.auth()?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { worldId } = req.params;

  try {
    // Use RLS-enabled function that authenticates via Clerk JWT
    const deleted = await deleteWorldAuth(req.headers, worldId);
    if (!deleted) {
      return res.status(404).json({ error: 'World not found' });
    }

    res.json({ success: true });
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'delete_world' } });
    res.status(500).json({ error: 'Failed to delete world' });
  }
});

app.post('/api/generate', wikiRateLimit, requireAuth(), async (req: any, res: any) => {

  const { input, type, context, worldbuildingHistory } = req.body;
  const userId = req.auth()?.userId;

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
    Sentry.captureException(error, { tags: { operation: 'generate_wiki' } });
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

app.post('/api/generate-section', wikiRateLimit, requireAuth(), async (req: any, res: any) => {

  const { sectionTitle, pageTitle, pageContent, worldbuildingHistory } = req.body;
  const userId = req.auth()?.userId;

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
    Sentry.captureException(error, { tags: { operation: 'generate_section' } });
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

app.post('/api/generate-image', imageRateLimit, requireAuth(), async (req: any, res: any) => {

  const { pageTitle, pageContent, worldbuildingHistory, worldId, pageId } = req.body;
  const userId = req.auth()?.userId;

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
      () => res.end(), // endResponse callback
      worldId,
      pageId
    );
  } catch (error: any) {
    Sentry.captureException(error, { tags: { operation: 'generate_image_express' } });
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

// Test endpoint for RLS integration (development only)
app.get('/api/test-rls', requireAuth(), async (req: any, res: any) => {
  const userId = req.auth()?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const testResults = await testRLSIntegration(userId);
    res.json({
      userId,
      testResults,
      message: 'RLS integration test completed'
    });
  } catch (error) {
    res.status(500).json({
      error: 'RLS test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Sentry error handling middleware (must be before other error handlers)
// Note: In Sentry v8, error handling is automatic with captureException

// Global error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  Sentry.captureException(err, { tags: { operation: 'unhandled_error' } });

  // Don't expose stack traces in production
  const isDev = process.env.NODE_ENV !== 'production';
  const errorMessage = isDev ? err.message : 'Internal Server Error';

  res.status(err.status || 500).json({
    error: 'Server Error',
    message: errorMessage,
    ...(isDev && { stack: err.stack })
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  Sentry.addBreadcrumb({ message: `Express server started on port ${port}`, level: 'info' });
});
