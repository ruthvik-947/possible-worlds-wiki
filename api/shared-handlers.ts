// Shared API handlers that work with both Express and Vercel
import { streamText, generateObject, experimental_generateImage as generateImage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  activeApiKeys,
  allCategories,
  getWorldbuildingContext,
  capitalizeTitle,
  hasExceededFreeLimit,
  incrementUsageForIP,
  getUsageForIP,
  getFreeLimit
} from './utils/shared.js';

// Helper function to generate structured metadata
export async function generateMetadata(
  input: string,
  type: 'seed' | 'term',
  context?: string,
  worldbuildingHistory?: any
): Promise<{
  categories: string[];
  clickableTerms: string[];
  relatedConcepts: Array<{term: string; description: string}>;
  basicFacts: Array<{name: string; value: string}>;
}> {
  const title = capitalizeTitle(
    type === 'seed' ?
      input.split(' ').slice(0, 5).join(' ').replace(/[.,!?]$/, '') :
      input
  );

  // For testing, return mock data if no API key
  if (!process.env.OPENAI_API_KEY) {
    console.log('No API key available, returning mock metadata');
    return {
      categories: ["Magic & Mysticism", "Supernatural Phenomena"],
      clickableTerms: ["crystal formation", "levitation field", "magical resonance", "astral energy", "floating stones"],
      relatedConcepts: [
        {"term": "Ethereal Physics", "description": "The study of matter-energy interactions in mystical dimensions"},
        {"term": "Crystalline Networks", "description": "Interconnected systems of magical crystals"}
      ],
      basicFacts: [
        {"name": "Formation", "value": "Natural crystallization in high-magic zones"},
        {"name": "Properties", "value": "Perpetual levitation and energy emission"},
        {"name": "Rarity", "value": "Found only in ancient magical sanctuaries"}
      ]
    };
  }

  const model = openai('gpt-4o');

  const metadataSchema = z.object({
    categories: z.array(z.string()),
    clickableTerms: z.array(z.string()),
    relatedConcepts: z.array(z.object({
      term: z.string(),
      description: z.string()
    })),
    basicFacts: z.array(z.object({
      name: z.string(),
      value: z.string()
    }))
  });

  try {
    const result = await generateObject({
      model: model,
      system: `You are a worldbuilding agent. You are deeply knowledgeable about history, mythology, cosmology, philosophy, science, and anthropology from around the world (not only the West), and have a Borgesian, and Pratchett-like imagination and a von-Neumann-esque sense of order.`,
      prompt: `Generate structured metadata for a wiki page in a possible universe about "${title}".

      The user has provided: "${input}"
      This is a ${type === 'seed' ? 'seed sentence to start the wiki' : `term to expand upon`}.
      ${context ? `The context for this term is: "${context}"` : ''}
      ${worldbuildingHistory ? `Existing worldbuilding context: "${getWorldbuildingContext(worldbuildingHistory)}"` : ''}

      For categories, choose 2-4 from: ${allCategories.join(', ')}
      For clickableTerms, list 5-8 specific nouns/concepts that would be interesting to explore.
      For relatedConcepts, list 2-4 related topics not directly mentioned.
      For basicFacts, list 3-4 key facts about the topic (e.g., year, location, population, and appropriate attributes like these). Follow the format: name | value`,
      schema: metadataSchema
    });

    return parseMetadata(result.object);
  } catch (e) {
    console.error('Failed to generate metadata:', e);
    // Fallback to mock data if generation fails
    return {
      categories: ["Magic & Mysticism", "Supernatural Phenomena"],
      clickableTerms: ["crystal formation", "levitation field", "magical resonance", "astral energy", "floating stones"],
      relatedConcepts: [
        {"term": "Ethereal Physics", "description": "The study of matter-energy interactions in mystical dimensions"},
        {"term": "Crystalline Networks", "description": "Interconnected systems of magical crystals"}
      ],
      basicFacts: [
        {"name": "Formation", "value": "Natural crystallization in high-magic zones"},
        {"name": "Properties", "value": "Perpetual levitation and energy emission"},
        {"name": "Rarity", "value": "Found only in ancient magical sanctuaries"}
      ]
    };
  }
}

export function parseMetadata(jsonData: any): {
  categories: string[];
  clickableTerms: string[];
  relatedConcepts: Array<{term: string; description: string}>;
  basicFacts: Array<{name: string; value: string}>;
} {
  const defaultResult = {
    categories: [],
    clickableTerms: [],
    relatedConcepts: [],
    basicFacts: []
  };

  if (!jsonData || typeof jsonData !== 'object') {
    return defaultResult;
  }

  return {
    categories: Array.isArray(jsonData.categories) ? jsonData.categories : [],
    clickableTerms: Array.isArray(jsonData.clickableTerms) ? jsonData.clickableTerms : [],
    relatedConcepts: Array.isArray(jsonData.relatedConcepts) ? jsonData.relatedConcepts : [],
    basicFacts: Array.isArray(jsonData.basicFacts) ? jsonData.basicFacts : []
  };
}

export async function handleGenerate(
  input: string,
  type: 'seed' | 'term',
  context?: string,
  worldbuildingHistory?: any,
  sessionId?: string,
  clientIP?: string,
  writeData?: (data: string) => void,
  endResponse?: () => void
) {
  const title = capitalizeTitle(
    type === 'seed' ?
      input.split(' ').slice(0, 5).join(' ').replace(/[.,!?]$/, '') :
      input
  );

  // Get client IP for rate limiting (fallback for development)
  const ip = clientIP || 'localhost';

  // Use API key from session if user API keys are enabled, otherwise use environment variable
  const enableUserApiKeys = process.env.ENABLE_USER_API_KEYS === 'true';
  const sessionData = (enableUserApiKeys && sessionId) ? activeApiKeys.get(sessionId) : null;
  const hasUserApiKey = !!sessionData?.apiKey;

  // If no user API key, check free tier limits
  if (!hasUserApiKey) {
    if (hasExceededFreeLimit(ip)) {
      const usage = getUsageForIP(ip);
      throw {
        status: 429,
        error: 'Daily free limit reached',
        message: `You've used ${usage.count}/${getFreeLimit()} free generations today. Please provide your own API key for unlimited usage.`,
        usageCount: usage.count,
        dailyLimit: getFreeLimit(),
        requiresApiKey: true
      };
    }
  }

  const apiKey = hasUserApiKey ? sessionData!.apiKey : process.env.OPENAI_API_KEY;

  // Allow testing without API key by proceeding with mock data
  if (!apiKey && process.env.NODE_ENV !== 'development') {
    throw {
      status: 401,
      error: 'No API key available',
      message: 'Please provide your OpenAI API key to continue.',
      requiresApiKey: true
    };
  }

  const pageId = Math.random().toString(36).substring(2, 11);


  // Phase 1: Generate structured metadata
  const metadata = await generateMetadata(input, type, context, worldbuildingHistory);

  // Send initial data with metadata
  const initialData = {
    id: pageId,
    title,
    content: '',
    categories: metadata.categories,
    clickableTerms: metadata.clickableTerms,
    relatedConcepts: metadata.relatedConcepts,
    basicFacts: metadata.basicFacts,
    isPartial: true,
    hasMetadata: true,
    progress: 20
  };

  if (writeData) {
    writeData('data: ' + JSON.stringify(initialData) + '\n\n');
  }

  // Phase 2: Generate streaming text content

  let accumulatedContent = '';

  // For testing without API key, simulate streaming content
  if (!apiKey) {
    const mockContent = `${title} are extraordinary manifestations of ${metadata.clickableTerms[0] || 'magical energy'} that defy conventional understanding of physics and matter. These remarkable formations appear as translucent, geometric structures that hover effortlessly in the air, emanating a soft, pulsating glow that shifts through the spectrum of visible light.

The ${metadata.clickableTerms[1] || 'levitation field'} surrounding each crystal creates a localized distortion in gravitational forces, allowing them to maintain their suspended state indefinitely. Scholars of ${metadata.relatedConcepts[0]?.term || 'Ethereal Physics'} have theorized that these crystals serve as conduits between the material realm and higher dimensions of existence.

Ancient texts describe vast networks of these floating sentinels, positioned strategically across ${metadata.clickableTerms[2] || 'magical resonance'} points throughout the world. When activated by specific harmonic frequencies, they can amplify and channel ${metadata.clickableTerms[3] || 'astral energy'} for various mystical purposes.

The formation process remains largely mysterious, though most agree it occurs only in areas of exceptional magical concentration, where the fabric of reality itself becomes more malleable and responsive to supernatural forces.`;

    // Simulate streaming by sending chunks
    const words = mockContent.split(' ');

    for (let i = 0; i < words.length; i += 5) {
      const chunk = words.slice(i, i + 5).join(' ') + ' ';
      accumulatedContent += chunk;

      const streamData = {
        id: pageId,
        title,
        content: accumulatedContent.trim(),
        categories: metadata.categories,
        clickableTerms: metadata.clickableTerms,
        relatedConcepts: metadata.relatedConcepts,
        basicFacts: metadata.basicFacts,
        isPartial: true,
        hasMetadata: true,
        progress: Math.min(90, Math.floor(20 + (i / words.length) * 70))
      };

      if (writeData) {
        writeData('data: ' + JSON.stringify(streamData) + '\n\n');
      }

      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    accumulatedContent = mockContent;
  } else {
    const contentModel = openai('gpt-4o');

    const result = await streamText({
      model: contentModel,
      prompt: `You are a worldbuilding agent. You are deeply knowledgeable about history, mythology, cosmology, philosophy, science, and anthropology from around the world (not only the West), and have a Borgesian, and Pratchett-like imagination and a von-Neumann-esque sense of order. Generate a wiki page for a topic within a possible universe. Do not imply that this universe is fictional! To you and the user it is real.

      The user has provided the following input: "${input}"
      This is a ${type === 'seed' ? 'seed sentence to start the wiki' : `term to expand upon`}.
      ${context ? `The context for this term is: "${context}"` : ''}
      ${worldbuildingHistory ? `Existing worldbuilding context: "${getWorldbuildingContext(worldbuildingHistory)}"` : ''}

      You must write about "${title}" and incorporate these structured elements naturally:
      - Categories: ${metadata.categories.join(', ')}
      - Key terms to mention: ${metadata.clickableTerms.join(', ')}
      - Related concepts: ${metadata.relatedConcepts.map(c => c.term).join(', ')}
      - Important facts: ${metadata.basicFacts.map(f => `${f.name}: ${f.value}`).join(', ')}

      Write a detailed and engaging encyclopedic article about "${title}". Write 3-4 paragraphs of rich, descriptive content that brings this topic to life. Be matter-of-fact and authoritative, no matter how fantastical the subject. ${worldbuildingHistory ? 'Ensure consistency with the existing worldbuilding context provided.' : ''}

      Write ONLY the article content. Do not include the title, headers, markdown-formatting, or any JSON metadata. Start directly with the first paragraph of content.`
    });


    for await (const textDelta of result.textStream) {
      accumulatedContent += textDelta;

      // Send streaming update
      const streamData = {
        id: pageId,
        title,
        content: accumulatedContent,
        categories: metadata.categories,
        clickableTerms: metadata.clickableTerms,
        relatedConcepts: metadata.relatedConcepts,
        basicFacts: metadata.basicFacts,
        isPartial: true,
        hasMetadata: true,
        progress: Math.min(90, Math.floor(20 + (accumulatedContent.length / 2000) * 70))
      };

      if (writeData) {
        writeData('data: ' + JSON.stringify(streamData) + '\n\n');
      }
    }
  }

  // If using free tier (no user API key), increment usage count
  if (!hasUserApiKey) {
    incrementUsageForIP(ip);
  }

  // Get current usage for response
  const currentUsage = getUsageForIP(ip);

  const finalData = {
    id: pageId,
    title,
    content: accumulatedContent.trim(),
    categories: metadata.categories,
    clickableTerms: metadata.clickableTerms,
    relatedConcepts: metadata.relatedConcepts,
    basicFacts: metadata.basicFacts,
    isPartial: false,
    isComplete: true,
    hasMetadata: true,
    usageInfo: hasUserApiKey ? null : {
      usageCount: currentUsage.count,
      dailyLimit: getFreeLimit(),
      remaining: getFreeLimit() - currentUsage.count
    }
  };

  if (writeData) {
    writeData('data: ' + JSON.stringify(finalData) + '\n\n');
  }

  if (endResponse) {
    endResponse();
  }

  return finalData;
}

export async function handleGenerateSection(
  sectionTitle: string,
  pageTitle: string,
  pageContent: string,
  worldbuildingHistory?: any,
  sessionId?: string,
  clientIP?: string,
  writeData?: (data: string) => void,
  endResponse?: () => void
) {
  const capitalizedSectionTitle = capitalizeTitle(sectionTitle);

  // Get client IP for rate limiting (fallback for development)
  const ip = clientIP || 'localhost';

  // Use API key from session if user API keys are enabled, otherwise use environment variable
  const enableUserApiKeys = process.env.ENABLE_USER_API_KEYS === 'true';
  const sessionData = (enableUserApiKeys && sessionId) ? activeApiKeys.get(sessionId) : null;
  const hasUserApiKey = !!sessionData?.apiKey;

  // If no user API key, check free tier limits
  if (!hasUserApiKey) {
    if (hasExceededFreeLimit(ip)) {
      const usage = getUsageForIP(ip);
      throw {
        status: 429,
        error: 'Daily free limit reached',
        message: `You've used ${usage.count}/${getFreeLimit()} free generations today. Please provide your own API key for unlimited usage.`,
        usageCount: usage.count,
        dailyLimit: getFreeLimit(),
        requiresApiKey: true
      };
    }
  }

  const apiKey = hasUserApiKey ? sessionData!.apiKey : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw {
      status: 401,
      error: 'No API key available',
      message: 'Please provide your OpenAI API key to continue.',
      requiresApiKey: true
    };
  }

  const model = openai('gpt-4o');


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

  let accumulatedText = '';

  for await (const textDelta of result.textStream) {
    accumulatedText += textDelta;

    // Send update on every textDelta for maximum streaming effect
    const streamData = {
      title: capitalizedSectionTitle,
      content: accumulatedText.trim(),
      isPartial: true,
      progress: Math.min(90, Math.floor((accumulatedText.length / 200) * 100))
    };

    if (writeData) {
      writeData('data: ' + JSON.stringify(streamData) + '\n\n');
    }
  }

  // If using free tier (no user API key), increment usage count
  if (!hasUserApiKey) {
    incrementUsageForIP(ip);
  }

  // Get current usage for response
  const currentUsage = getUsageForIP(ip);

  // Send final complete text
  const finalData = {
    title: capitalizedSectionTitle,
    content: accumulatedText.trim(),
    isPartial: false,
    isComplete: true,
    usageInfo: hasUserApiKey ? null : {
      usageCount: currentUsage.count,
      dailyLimit: getFreeLimit(),
      remaining: getFreeLimit() - currentUsage.count
    }
  };

  if (writeData) {
    writeData('data: ' + JSON.stringify(finalData) + '\n\n');
  }

  if (endResponse) {
    endResponse();
  }

  return finalData;
}

export async function handleImageGeneration(
  pageTitle: string,
  pageContent: string,
  worldbuildingHistory?: any,
  sessionId?: string,
  clientIP?: string,
  writeData?: (data: string) => void,
  endResponse?: () => void
) {
  // Get client IP for rate limiting (fallback for development)
  const ip = clientIP || 'localhost';

  // Use API key from session if user API keys are enabled, otherwise use environment variable
  const enableUserApiKeys = process.env.ENABLE_USER_API_KEYS === 'true';
  const sessionData = (enableUserApiKeys && sessionId) ? activeApiKeys.get(sessionId) : null;
  const hasUserApiKey = !!sessionData?.apiKey;

  // If no user API key, check free tier limits
  if (!hasUserApiKey) {
    if (hasExceededFreeLimit(ip)) {
      const usage = getUsageForIP(ip);
      throw {
        status: 429,
        error: 'Daily free limit reached',
        message: `You've used ${usage.count}/${getFreeLimit()} free generations today. Please provide your own API key for unlimited usage.`,
        usageCount: usage.count,
        dailyLimit: getFreeLimit(),
        requiresApiKey: true
      };
    }
  }

  const apiKey = hasUserApiKey ? sessionData!.apiKey : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw {
      status: 401,
      error: 'No API key available',
      message: 'Please provide your OpenAI API key to continue.',
      requiresApiKey: true
    };
  }

  // Send initial progress
  if (writeData) {
    writeData('data: ' + JSON.stringify({
      status: 'generating',
      progress: 10,
      message: 'Creating image prompt...'
    }) + '\n\n');
  }

  try {
    // Create a concise image prompt based on the page content
    const imagePrompt = `A minimalist, stylized illustration of ${pageTitle}. ${pageContent.split('.')[0]}. Simple, clean art style with muted colors, suitable for a wiki encyclopedia entry. Not photorealistic, more like a conceptual diagram or artistic interpretation.`;

    if (writeData) {
      writeData('data: ' + JSON.stringify({
        status: 'generating',
        progress: 30,
        message: 'Generating image...'
      }) + '\n\n');
    }

    const result = await generateImage({
      model: openai.image('dall-e-3'),
      prompt: imagePrompt,
      n: 1,
      size: '1024x1024',
      providerOptions: {
        openai: {
          quality: 'standard',
          style: 'natural'
        }
      }
    });

    if (writeData) {
      writeData('data: ' + JSON.stringify({
        status: 'generating',
        progress: 90,
        message: 'Processing image...'
      }) + '\n\n');
    }

    // If using free tier (no user API key), increment usage count
    if (!hasUserApiKey) {
      incrementUsageForIP(ip);
    }

    // Get current usage for response
    const currentUsage = getUsageForIP(ip);

    const finalData = {
      status: 'complete',
      imageUrl: result.image.url,
      prompt: imagePrompt,
      usageInfo: hasUserApiKey ? null : {
        usageCount: currentUsage.count,
        dailyLimit: getFreeLimit(),
        remaining: getFreeLimit() - currentUsage.count
      }
    };

    if (writeData) {
      writeData('data: ' + JSON.stringify(finalData) + '\n\n');
    }

    if (endResponse) {
      endResponse();
    }

    return finalData;
  } catch (error) {
    console.error('Image generation error:', error);
    throw {
      status: 500,
      error: 'Image generation failed',
      message: 'Failed to generate image. Please try again.'
    };
  }
}