import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import 'dotenv/config';

// Store API keys temporarily in memory (will be cleared on server restart)
const activeApiKeys = new Map();

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

app.use(cors());
app.use(bodyParser.json());

const worldbuildingCategories = {
  mental: ['Culture', 'Identity', 'Beliefs', 'Ideologies', 'Language', 'Networks', 'Behavior', 'Memes'],
  material: ['Physics', 'Chemistry', 'Biology', 'Landscapes & Terrains', 'Climate'],
  social: ['Social Structure', 'Politics', 'Work', 'Technology', 'Architecture', 'Ethics', 'Transportation', 'Zoology']
};

const allCategories = [...worldbuildingCategories.mental, ...worldbuildingCategories.material, ...worldbuildingCategories.social];

// Helper function to extract worldbuilding context from history
function getWorldbuildingContext(history: any): string {
  const contextParts = [];
  
  for (const [group, categories] of Object.entries(history)) {
    for (const [category, entries] of Object.entries(categories as any)) {
      if ((entries as string[]).length > 0) {
        contextParts.push(`${category}: ${(entries as string[]).join(', ')}`);
      }
    }
  }
  
  return contextParts.join('. ');
}

function capitalizeTitle(title: string): string {
  return title
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

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

  const title = capitalizeTitle(
    type === 'seed' ?
      input.split(' ').slice(0, 5).join(' ').replace(/[.,!?]$/, '') :
      input
  );

  // Use API key from session if user API keys are enabled, otherwise use environment variable
  const enableUserApiKeys = process.env.ENABLE_USER_API_KEYS === 'true';
  const sessionData = (enableUserApiKeys && sessionId) ? activeApiKeys.get(sessionId) : null;
  const apiKey = sessionData ? sessionData.apiKey : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const errorMessage = enableUserApiKeys
      ? 'No valid API key provided. Please set your API key first.'
      : 'No API key configured. Please set OPENAI_API_KEY in your environment variables.';
    return res.status(401).json({ error: errorMessage });
  }

  try {
    const model = openai('gpt-4o');

    console.log('Express: About to call streamText');
    const result = await streamText({
      model: model,
      prompt: `You are a worldbuilding agent. You are profoundly knowledgeable about history, mythology, cosmology, philosophy, science, and anthropology from around the world (not only the West), and have a Borgesian or Calvino-esque imagination. Generate a wiki page for a topic within a fictional possible universe.

      The user has provided the following input: "${input}"
      This is a ${type === 'seed' ? 'seed sentence to start the wiki' : `term to expand upon`}.
      ${context ? `The context for this term is: "${context}"` : ''}
      ${worldbuildingHistory ? `Existing worldbuilding context: "${getWorldbuildingContext(worldbuildingHistory)}"` : ''}

      Generate a wiki page titled "${title}" with the following structure:

      CONTENT:
      Write 3-4 paragraphs of detailed and engaging encyclopedic content. Be descriptive and matter-of-fact, no matter how absurd the topic. ${worldbuildingHistory ? 'Ensure consistency with the existing worldbuilding context provided.' : ''}

      CATEGORIES:
      List 2-4 relevant categories from: ${allCategories.join(', ')}

      CLICKABLE_TERMS:
      List 5-8 specific nouns, concepts, or names from your content that would be interesting to explore further. These must be exact phrases from the content.

      RELATED_CONCEPTS:
      List 2-4 related topics not directly in the content. Format: term | description

      BASIC_FACTS:
      List 3-4 basic facts. Format: fact_name | fact_value
      Examples: Year | 31457AD, Location | Eastern Mars, Population | 2.3 million

      Use the exact section headers above (CONTENT:, CATEGORIES:, etc.) and write naturally, not in JSON format.`
    });

    // Set up streaming response headers
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Streaming', 'true');

    let accumulatedText = '';
    const pageId = Math.random().toString(36).substring(2, 11);

    console.log('Express: Starting to process textStream');
    try {
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        console.log('Express: Received textDelta:', textDelta.length, 'chars');

        // Parse sections as they complete
        const sections = {
          content: extractSection(accumulatedText, 'CONTENT:', 'CATEGORIES:') || '',
          categories: extractList(accumulatedText, 'CATEGORIES:', 'CLICKABLE_TERMS:') || [],
          clickableTerms: extractList(accumulatedText, 'CLICKABLE_TERMS:', 'RELATED_CONCEPTS:') || [],
          relatedConcepts: extractKeyValueList(accumulatedText, 'RELATED_CONCEPTS:', 'BASIC_FACTS:') || [],
          basicFacts: extractKeyValueList(accumulatedText, 'BASIC_FACTS:', null) || []
        };

        // Send update on every textDelta for maximum streaming effect
        const partialData = {
          id: pageId,
          title,
          content: sections.content,
          categories: sections.categories,
          clickableTerms: sections.clickableTerms,
          relatedConcepts: sections.relatedConcepts,
          basicFacts: sections.basicFacts,
          isPartial: true,
          progress: Math.min(90, Math.floor((accumulatedText.length / 2500) * 100))
        };

        res.write('data: ' + JSON.stringify(partialData) + '\n\n');
        console.log('Express: Sent streaming update, content length:', sections.content.length);
      }

      // Parse final complete response
      const finalSections = {
        content: extractSection(accumulatedText, 'CONTENT:', 'CATEGORIES:') || '',
        categories: extractList(accumulatedText, 'CATEGORIES:', 'CLICKABLE_TERMS:') || [],
        clickableTerms: extractList(accumulatedText, 'CLICKABLE_TERMS:', 'RELATED_CONCEPTS:') || [],
        relatedConcepts: extractKeyValueList(accumulatedText, 'RELATED_CONCEPTS:', 'BASIC_FACTS:') || [],
        basicFacts: extractKeyValueList(accumulatedText, 'BASIC_FACTS:', null) || []
      };

      const finalData = {
        id: pageId,
        title,
        ...finalSections,
        isPartial: false,
        isComplete: true
      };

      res.write('data: ' + JSON.stringify(finalData) + '\n\n');
      res.end();

    } catch (streamError) {
      console.error('Express: Streaming error:', streamError);
      res.write('data: ' + JSON.stringify({ error: 'Failed to generate wiki page' }) + '\n\n');
      res.end();
    }

  } catch (error) {
    console.error('Express: Error:', error);
    res.status(500).json({ error: 'Failed to generate wiki page' });
  }
});

app.post('/api/generate-section', async (req: any, res: any) => {
  console.log('Express: Starting section generation for:', req.body.sectionTitle);

  const { sectionTitle, pageTitle, pageContent, worldbuildingHistory, sessionId } = req.body;

  const capitalizedSectionTitle = capitalizeTitle(sectionTitle);

  // Use API key from session if user API keys are enabled, otherwise use environment variable
  const enableUserApiKeys = process.env.ENABLE_USER_API_KEYS === 'true';
  const sessionData = (enableUserApiKeys && sessionId) ? activeApiKeys.get(sessionId) : null;
  const apiKey = sessionData ? sessionData.apiKey : process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    const errorMessage = enableUserApiKeys 
      ? 'No valid API key provided. Please set your API key first.'
      : 'No API key configured. Please set OPENAI_API_KEY in your environment variables.';
    return res.status(401).json({ error: errorMessage });
  }

  try {
    const model = openai('gpt-4o');

    console.log('Express: About to call streamText for section');
    const result = await streamText({
      model: model,
      prompt: `You are a creative worldbuilding assistant. Generate content for a new section of a wiki page.

      The main page is titled: "${pageTitle}"
      The main page content is: "${pageContent}"
      The new section title is: "${capitalizedSectionTitle}"
      ${worldbuildingHistory ? `Existing worldbuilding context: "${getWorldbuildingContext(worldbuildingHistory)}"` : ''}

      Generate a single paragraph of content for the section "${capitalizedSectionTitle}". The content should:
      - Be written in an encyclopedic tone that matches the main page
      - Be 2-3 sentences long
      - Be relevant to the section title
      - Maintain consistency with the main page content and any existing worldbuilding context
      - Not track real world entities or concepts much

      Write only the paragraph content. Do not include any labels, section headers, or markdown formatting.`
    });

    // Set up streaming response headers
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Streaming', 'true');

    let accumulatedText = '';

    console.log('Express: Starting to process section textStream');
    try {
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        console.log('Express: Section received textDelta:', textDelta.length, 'chars');

        // Send update on every textDelta for maximum streaming effect
        const streamData = {
          title: capitalizedSectionTitle,
          content: accumulatedText.trim(),
          isPartial: true,
          progress: Math.min(90, Math.floor((accumulatedText.length / 200) * 100))
        };

        res.write('data: ' + JSON.stringify(streamData) + '\n\n');
        console.log('Express: Sent section streaming update, length:', accumulatedText.length);
      }

      // Send final complete text
      const finalData = {
        title: capitalizedSectionTitle,
        content: accumulatedText.trim(),
        isPartial: false,
        isComplete: true
      };

      res.write('data: ' + JSON.stringify(finalData) + '\n\n');
      res.end();

    } catch (streamError) {
      console.error('Express: Section streaming error:', streamError);
      res.write('data: ' + JSON.stringify({ error: 'Failed to generate section content' }) + '\n\n');
      res.end();
    }

  } catch (error) {
    console.error('Express: Section error:', error);
    res.status(500).json({ error: 'Failed to generate section content' });
  }
});

// Helper functions to extract sections from streamed text
function extractSection(text: string, startMarker: string, endMarker: string | null): string | null {
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) return null;

  const contentStart = startIndex + startMarker.length;
  const endIndex = endMarker ? text.indexOf(endMarker, contentStart) : text.length;

  if (endMarker && endIndex === -1) {
    // Section not complete yet, return what we have
    return text.substring(contentStart).trim();
  }

  return text.substring(contentStart, endIndex).trim();
}

function extractList(text: string, startMarker: string, endMarker: string | null): string[] {
  const section = extractSection(text, startMarker, endMarker);
  if (!section) return [];

  return section
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('-'))
    .map(line => line.replace(/^[-•]\s*/, '').trim());
}

function extractKeyValueList(text: string, startMarker: string, endMarker: string | null): Array<{term?: string; description?: string; name?: string; value?: string}> {
  const section = extractSection(text, startMarker, endMarker);
  if (!section) return [];

  return section
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && line.includes('|'))
    .map(line => {
      const [key, value] = line.split('|').map(s => s.trim());
      // Check if this is for related concepts or basic facts
      if (startMarker.includes('RELATED')) {
        return { term: key, description: value };
      } else {
        return { name: key, value: value };
      }
    });
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
