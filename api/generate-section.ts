import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { activeApiKeys, getWorldbuildingContext, capitalizeTitle } from './utils/shared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}