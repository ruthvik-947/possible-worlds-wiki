import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import 'dotenv/config';
import { handleGenerate, handleGenerateSection } from './shared-handlers.js';
import { activeApiKeys } from './utils/shared.js';

// Clean up old API keys every hour
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of activeApiKeys.entries()) {
    if (now - data.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
      activeApiKeys.delete(sessionId);
    }
  }
}, 60 * 60 * 1000); // Check every hour

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
  exposedHeaders: ['x-streaming']
}));
app.use(bodyParser.json());

// Check if user API keys are enabled
app.get('/api/config', (req: any, res: any) => {
  res.json({
    enableUserApiKeys: process.env.ENABLE_USER_API_KEYS === 'true'
  });
});

// API key storage endpoint (no validation for now)
app.post('/api/store-key', async (req: any, res: any) => {
  const { apiKey } = req.body;

  if (!apiKey || !apiKey.startsWith('sk-')) {
    return res.status(400).json({ error: 'Invalid API key format' });
  }

  // Store the API key with a session ID
  const sessionId = Math.random().toString(36).substr(2, 9);
  activeApiKeys.set(sessionId, { apiKey, timestamp: Date.now() });

  res.json({ 
    success: true, 
    sessionId,
    message: 'API key stored' 
  });
});

app.post('/api/generate', async (req: any, res: any) => {
  console.log('Express: Starting generation request for:', req.body.input);

  const { input, type, context, worldbuildingHistory, sessionId } = req.body;

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
      sessionId,
      'localhost', // clientIP for development
      (data: string) => {
        console.log('Express: Writing data chunk:', data.substring(0, 50) + '...');
        res.write(data);
      },
      () => {
        console.log('Express: Ending response');
        res.end();
      }
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

app.post('/api/generate-section', async (req: any, res: any) => {
  console.log('Express: Starting section generation for:', req.body.sectionTitle);

  const { sectionTitle, pageTitle, pageContent, worldbuildingHistory, sessionId } = req.body;

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
      sessionId,
      'localhost', // clientIP for development
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


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
