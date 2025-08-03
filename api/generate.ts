import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { activeApiKeys, allCategories, getWorldbuildingContext, capitalizeTitle } from './utils/shared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}