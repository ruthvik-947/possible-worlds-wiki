import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
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
    const model = openai('gpt-4o', {
      apiKey: apiKey
    });
    
    const result = await generateObject({
      model: model,
      schema: z.object({
        content: z.string().describe("The main wiki content for the page, written in a descriptive and encyclopedic style. Should be 3-4 paragraphs long. If the user input references real-world entities, concepts and people, be sure to understand them as they are known in this world, otherwise, ensure that the content only mildly tracks real-world entities."),
        categories: z.array(z.string()).describe("A list of 2-4 relevant categories for this topic from the provided list."),
        clickableTerms: z.array(z.string()).describe("A list of 5-8 interesting terms or proper nouns from the generated content that could be clicked to generate a new wiki page. These should be exact matches to words in the content."),
        relatedConcepts: z.array(z.object({
          term: z.string(),
          description: z.string(),
        })).describe("A list of 2-4 related concepts with a brief description of their relevance."),
        basicFacts: z.array(z.object({
          name: z.string(),
          value: z.string(),
        })).describe("A list of 3-4 basic facts about the topic in the format 'fact name: text'. Examples: 'Year: 31457AD', 'Location: Eastern Mars', 'Population: 2.3 million'. These should be single sentences and relevant to the topic.")
      }),
      prompt: `You are a worldbuilding agent. You are profoundly knowledgeable about history, mythology, cosmology, philosophy, science, and anthropology from around the world (not only the West), and have a Borgesian or Calvino-esque imagination. Generate a wiki page for a topic within a fictional possible universe.
      
      The user has provided the following input: "${input}"
      This is a ${type === 'seed' ? 'seed sentence to start the wiki' : `term to expand upon`}.
      ${context ? `The context for this term is: "${context}"` : ''}
      ${worldbuildingHistory ? `Existing worldbuilding context: "${getWorldbuildingContext(worldbuildingHistory)}"` : ''}

      Available worldbuilding categories: ${allCategories.join(', ')}.

      Generate the following for the wiki page titled "${title}":
      1.  **Categories**: 2-4 relevant categories from the list provided. 
      2.  **Content**: A detailed and engaging description (3-4 paragraphs). It should be written in an encyclopedic tone. In other words, be descriptive and matter-of-fact, no matter how absurd the topic. Use the categories you selected to guide your imagination. ${worldbuildingHistory ? 'Ensure consistency with the existing worldbuilding context provided.' : ''}
      3.  **Clickable Terms**: 5-8 specific nouns, concepts, or names from the content you wrote that would be interesting to explore further. These must be exact phrases from the content and they must be related to the categories you selected. Ensure that these do not track real world entities or concepts much.
      4.  **Related Concepts**: 2-4 related topics that are not directly in the content but are relevant to the title. Provide a short description for each.
      5.  **Basic Facts**: 3-4 basic facts about the topic in the format 'fact name: text'. Examples: 'Year: 31457AD', 'Location: Eastern Mars', 'Population: 2.3 million'. These should be single sentences and relevant to the topic.
      
      Do not use markdown in your response.`
    });

    res.json({
      id: Math.random().toString(36).substr(2, 9),
      title,
      ...result.object,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate wiki page' });
  }
});

app.post('/api/generate-section', async (req: any, res: any) => {
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
    const model = openai('gpt-4o', {
      apiKey: apiKey
    });
    
    const result = await generateObject({
      model: model,
      schema: z.object({
        content: z.string().describe("A single paragraph of content for the section, written in an encyclopedic style that matches the tone of the main page content. Should be 2-3 sentences long and relevant to the section title.")
      }),
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
      
      Do not use markdown in your response.`
    });

    res.json({
      title: capitalizedSectionTitle,
      content: result.object.content,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate section content' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
