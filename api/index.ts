const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { generateObject } = require('ai');
const { openai } = require('@ai-sdk/openai');
const { z } = require('zod');
require('dotenv/config');

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
  if (!history) return '';
  
  const contextParts: string[] = [];
  
  Object.entries(history).forEach(([group, categories]: [string, any]) => {
    Object.entries(categories).forEach(([category, entries]: [string, any]) => {
      if (entries && entries.length > 0) {
        contextParts.push(`${category}: ${entries.slice(-2).join('; ')}`);
      }
    });
  });
  
  return contextParts.join('. ');
}

app.post('/api/generate', async (req: any, res: any) => {
  const { input, type, context, worldbuildingHistory } = req.body;

  const title = type === 'seed' ?
    input.split(' ').slice(0, 5).join(' ').replace(/[.,!?]$/, '') :
    input;

  try {
    const result = await generateObject({
      model: openai('gpt-4o'),
      schema: z.object({
        content: z.string().describe("The main wiki content for the page, written in a descriptive and encyclopedic style. Should be 3-4 paragraphs long. Ensure that the content doesn't track real world entities or concepts much."),
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
      prompt: `You are a creative worldbuilding assistant. You are profoundly knowledgeable about mythologies from around the world (not only Western ones), and have a Borgesian imagination. Generate a wiki page for a fictional possible universe.
      
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
  const { sectionTitle, pageTitle, pageContent, worldbuildingHistory } = req.body;

  try {
    const result = await generateObject({
      model: openai('gpt-4o'),
      schema: z.object({
        content: z.string().describe("A single paragraph of content for the section, written in an encyclopedic style that matches the tone of the main page content. Should be 2-3 sentences long and relevant to the section title.")
      }),
      prompt: `You are a creative worldbuilding assistant. Generate content for a new section of a wiki page.
      
      The main page is titled: "${pageTitle}"
      The main page content is: "${pageContent}"
      The new section title is: "${sectionTitle}"
      ${worldbuildingHistory ? `Existing worldbuilding context: "${getWorldbuildingContext(worldbuildingHistory)}"` : ''}

      Generate a single paragraph of content for the section "${sectionTitle}". The content should:
      - Be written in an encyclopedic tone that matches the main page
      - Be 2-3 sentences long
      - Be relevant to the section title
      - Maintain consistency with the main page content and any existing worldbuilding context
      - Not track real world entities or concepts much
      
      Do not use markdown in your response.`
    });

    res.json({
      title: sectionTitle,
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
