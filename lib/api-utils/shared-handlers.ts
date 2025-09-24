// Shared API handlers that work with both Express and Vercel
import { streamText, generateObject, experimental_generateImage as generateImage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  allCategories,
  getWorldbuildingContext,
  capitalizeTitle,
  getFreeLimit
} from './shared.js';
import { uploadImageToBlob } from './imageStorage.js';
import {
  getUsageForUser,
  incrementUsageForUser,
  hasExceededUserLimit
} from './quota.js';
// Import the vault-based storage (which has fallback to in-memory)
import {
  storeApiKey,
  getApiKey,
  removeApiKey,
  hasApiKey
} from './apiKeyVault.js';

// Input validation schemas
const generateSchema = z.object({
  input: z.string().min(1, 'Input is required').max(5000, 'Input too long (max 5000 characters)'),
  type: z.enum(['seed', 'term'], { required_error: 'Type must be either "seed" or "term"' }),
  context: z.string().max(10000, 'Context too long (max 10000 characters)').optional(),
  worldbuildingHistory: z.record(z.any()).optional()
});

const generateSectionSchema = z.object({
  sectionTitle: z.string().min(1, 'Section title is required').max(200, 'Section title too long (max 200 characters)'),
  pageTitle: z.string().min(1, 'Page title is required').max(200, 'Page title too long (max 200 characters)'),
  pageContent: z.string().min(1, 'Page content is required').max(50000, 'Page content too long (max 50000 characters)'),
  worldbuildingHistory: z.record(z.any()).optional()
});

const imageGenerationSchema = z.object({
  pageTitle: z.string().min(1, 'Page title is required').max(200, 'Page title too long (max 200 characters)'),
  pageContent: z.string().min(1, 'Page content is required').max(10000, 'Page content too long for image generation (max 10000 characters)'),
  worldbuildingHistory: z.record(z.any()).optional(),
  worldId: z.string().optional(),
  pageId: z.string().optional()
});

const apiKeySchema = z.object({
  apiKey: z.string().min(1, 'API key is required').regex(/^sk-[a-zA-Z0-9_-]{20,}$/, 'Invalid OpenAI API key format')
});

// Helper function to validate and sanitize inputs
export function validateGenerateInput(data: any) {
  try {
    return generateSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw {
        status: 400,
        error: 'Validation Error',
        message: firstError.message,
        field: firstError.path.join('.')
      };
    }
    throw error;
  }
}

export function validateGenerateSectionInput(data: any) {
  try {
    return generateSectionSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw {
        status: 400,
        error: 'Validation Error',
        message: firstError.message,
        field: firstError.path.join('.')
      };
    }
    throw error;
  }
}

export function validateImageGenerationInput(data: any) {
  try {
    return imageGenerationSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw {
        status: 400,
        error: 'Validation Error',
        message: firstError.message,
        field: firstError.path.join('.')
      };
    }
    throw error;
  }
}

export function validateApiKey(data: any) {
  try {
    return apiKeySchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw {
        status: 400,
        error: 'Validation Error',
        message: firstError.message,
        field: firstError.path.join('.')
      };
    }
    throw error;
  }
}

export async function handleStoreApiKey(
  method: string,
  apiKey?: string,
  userId?: string
) {
  if (!userId) {
    throw {
      status: 401,
      error: 'Unauthorized',
      message: 'Authentication required'
    };
  }

  if (method === 'GET') {
    const hasKey = await hasApiKey(userId);
    return { hasKey };
  }

  if (method === 'POST') {
    if (!apiKey) {
      throw {
        status: 400,
        error: 'Validation Error',
        message: 'API key is required'
      };
    }

    // Validate API key format
    const validatedInput = validateApiKey({ apiKey });

    await storeApiKey(userId, validatedInput.apiKey);
    return { success: true, message: 'API key stored securely' };
  }

  if (method === 'DELETE') {
    await removeApiKey(userId);
    return { success: true };
  }

  throw {
    status: 405,
    error: 'Method Not Allowed',
    message: 'Only GET, POST, and DELETE methods are supported'
  };
}

// Helper function to generate structured metadata
// Shared system prompt for consistency and token savings
const WORLDBUILDING_SYSTEM = `You are a worldbuilding agent with great knowledge of history, mythology, cosmology, philosophy, science, and anthropology from all cultures. 

Your writing combines the following styles: Borgesian: baroque erudition, pseudo-scholarly tone, citations to nonexistent works, recursive paradoxes. 

Pratchett-esque: sly irony, earthy wit, comic undercutting of grandeur, affectionate mockery of institutions.

Von Neumannian: crystalline precision, insistence on explicit definitions, logical sequence.

Do not narrate events in a cinematic way; always remain encyclopaedic.`;

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
    // console.log('No API key available, returning mock metadata');
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
      system: WORLDBUILDING_SYSTEM,
      prompt: `Generate structured metadata for a wiki page in a possible universe about "${title}". Be creative and interesting, but not overbearing.
Input: "${input}" (${type})${context ? `\nContext: "${context.substring(0, 200)}..."` : ''}${worldbuildingHistory ? `\nWorld context: ${getWorldbuildingContext(worldbuildingHistory)}` : ''}

Provide:
- 2-4 categories from: ${allCategories.join(', ')}
- 5-8 clickableTerms (specific, interesting nouns/concepts)
- 2-4 relatedConcepts with descriptions
- 3-4 basicFacts (name|value format, e.g., year|3140AD, location|Eastern China)`,
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
  userId?: string,
  clientIP?: string,
  writeData?: (data: string) => void,
  endResponse?: () => void
) {
  // Validate input
  const validatedInput = validateGenerateInput({
    input,
    type,
    context,
    worldbuildingHistory
  });
  const title = capitalizeTitle(
    type === 'seed' ?
      input.split(' ').slice(0, 5).join(' ').replace(/[.,!?]$/, '') :
      input
  );

  // Use API key from session if user API keys are enabled, otherwise use environment variable
  const enableUserApiKeys = process.env.ENABLE_USER_API_KEYS === 'true';
  const userApiKey = (enableUserApiKeys && userId) ? await getApiKey(userId) : null;
  const hasUserApiKey = !!userApiKey;

  if (!userId) {
    throw {
      status: 401,
      error: 'Unauthorized',
      message: 'Missing user context for request.'
    };
  }

  // If no user API key, check free tier limits
  if (!hasUserApiKey) {
    if (await hasExceededUserLimit(userId)) {
      const usage = await getUsageForUser(userId);
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

  const apiKey = hasUserApiKey ? userApiKey : process.env.OPENAI_API_KEY;

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
      system: WORLDBUILDING_SYSTEM,
      prompt: `Generate a wiki article about "${title}" in a possible universe. Do not imply that the universe is fictional.

Input: "${input}" (${type})${context ? `\nContext: ${context.substring(0, 200)}` : ''}${worldbuildingHistory ? `\nWorld: ${getWorldbuildingContext(worldbuildingHistory)}` : ''}

Naturally incorporate:
- Terms: ${metadata.clickableTerms.slice(0, 6).join(', ')}
- Facts: ${metadata.basicFacts.slice(0, 3).map(f => `${f.name}:${f.value}`).join(', ')}

Write a detailed and engaging encyclopedic article, with 3-4 paragraphs. Be authoritative and matter-of-fact, no matter how fantastical the subject. Ensure consistency with the existing worldbuilding context provided. Output only article content, no formatting.`
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

  let usageInfo = null as null | {
    usageCount: number;
    dailyLimit: number;
    remaining: number;
  };

  if (!hasUserApiKey) {
    const usageAfterIncrement = await incrementUsageForUser(userId);
    const dailyLimit = getFreeLimit();
    usageInfo = {
      usageCount: usageAfterIncrement.count,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - usageAfterIncrement.count)
    };
  }

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
    usageInfo
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
  userId?: string,
  clientIP?: string,
  writeData?: (data: string) => void,
  endResponse?: () => void
) {
  // Validate input
  const validatedInput = validateGenerateSectionInput({
    sectionTitle,
    pageTitle,
    pageContent,
    worldbuildingHistory
  });
  const capitalizedSectionTitle = capitalizeTitle(sectionTitle);

  // Use API key from session if user API keys are enabled, otherwise use environment variable
  const enableUserApiKeys = process.env.ENABLE_USER_API_KEYS === 'true';
  const userApiKey = (enableUserApiKeys && userId) ? await getApiKey(userId) : null;
  const hasUserApiKey = !!userApiKey;

  if (!userId) {
    throw {
      status: 401,
      error: 'Unauthorized',
      message: 'Missing user context for request.'
    };
  }

  // If no user API key, check free tier limits
  if (!hasUserApiKey) {
    if (await hasExceededUserLimit(userId)) {
      const usage = await getUsageForUser(userId);
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

  const apiKey = hasUserApiKey ? userApiKey : process.env.OPENAI_API_KEY;

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
    system: 'Generate concise wiki section content.',
    prompt: `Page: "${pageTitle}"
Context: ${pageContent.substring(0, 500)}...
Section: "${capitalizedSectionTitle}"${worldbuildingHistory ? `\nWorld: ${getWorldbuildingContext(worldbuildingHistory)}` : ''}

Write 2-3 encyclopedic sentences for this section. Match the page tone. Output only content.`
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

  let usageInfo = null as null | {
    usageCount: number;
    dailyLimit: number;
    remaining: number;
  };

  if (!hasUserApiKey) {
    const usageAfterIncrement = await incrementUsageForUser(userId);
    const dailyLimit = getFreeLimit();
    usageInfo = {
      usageCount: usageAfterIncrement.count,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - usageAfterIncrement.count)
    };
  }

  // Send final complete text
  const finalData = {
    title: capitalizedSectionTitle,
    content: accumulatedText.trim(),
    isPartial: false,
    isComplete: true,
    usageInfo
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
  userId?: string,
  clientIP?: string,
  writeData?: (data: string) => void,
  endResponse?: () => void,
  worldId?: string,
  pageId?: string
) {
  // Validate input
  const validatedInput = validateImageGenerationInput({
    pageTitle,
    pageContent,
    worldbuildingHistory,
    worldId,
    pageId
  });
  // Use API key from session if user API keys are enabled, otherwise use environment variable
  const enableUserApiKeys = process.env.ENABLE_USER_API_KEYS === 'true';
  const userApiKey = (enableUserApiKeys && userId) ? await getApiKey(userId) : null;
  const hasUserApiKey = !!userApiKey;

  if (!userId) {
    throw {
      status: 401,
      error: 'Unauthorized',
      message: 'Missing user context for request.'
    };
  }

  // If no user API key, check free tier limits
  if (!hasUserApiKey) {
    if (await hasExceededUserLimit(userId)) {
      const usage = await getUsageForUser(userId);
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

  const apiKey = hasUserApiKey ? userApiKey : process.env.OPENAI_API_KEY;

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
    const imagePrompt = `Minimalist wiki illustration of ${pageTitle}. ${pageContent.split('.')[0].substring(0, 100)}. Clean conceptual diagram or artistic interpretation style, muted colors.`;

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

    let usageInfo = null as null | {
      usageCount: number;
      dailyLimit: number;
      remaining: number;
    };

    if (!hasUserApiKey) {
      const usageAfterIncrement = await incrementUsageForUser(userId);
      const dailyLimit = getFreeLimit();
      usageInfo = {
        usageCount: usageAfterIncrement.count,
        dailyLimit,
        remaining: Math.max(0, dailyLimit - usageAfterIncrement.count)
      };
    }

    const generatedImage = result.images && result.images.length > 0 ? result.images[0] : null;
    let imageUrl: string | null = null;

    if (generatedImage) {
      const base64Data = (generatedImage as any).base64Data;
      const url = (generatedImage as any).url;

      if (base64Data || url) {
        // If we have blob storage configured and required IDs, upload to blob
        if (process.env.BLOB_READ_WRITE_TOKEN && worldId && pageId) {
          try {
            const mediaType = generatedImage?.mediaType || 'image/png';
            const imageData = base64Data
              ? `data:${mediaType};base64,${base64Data}`
              : url;

            imageUrl = await uploadImageToBlob({
              userId: userId!,
              worldId,
              pageId,
              imageData
            });

            if (writeData) {
              writeData('data: ' + JSON.stringify({
                status: 'generating',
                progress: 95,
                message: 'Uploading image to storage...'
              }) + '\n\n');
            }
          } catch (uploadError) {
            console.error('Failed to upload to blob storage, falling back to data URL:', uploadError);
            // Fallback to data URL if upload fails
            const mediaType = generatedImage?.mediaType || 'image/png';
            imageUrl = base64Data
              ? `data:${mediaType};base64,${base64Data}`
              : url;
          }
        } else {
          // No blob storage configured, use data URL
          const mediaType = generatedImage?.mediaType || 'image/png';
          imageUrl = base64Data
            ? `data:${mediaType};base64,${base64Data}`
            : url;
        }
      }
    }

    const finalData = {
      status: 'complete',
      imageUrl: imageUrl,
      prompt: imagePrompt,
      usageInfo
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

// ==================== WORLD SHARING HANDLERS ====================

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase environment variables not configured. Sharing features will not work.');
}

const supabaseAdmin = supabaseUrl && supabaseServiceKey ?
  createClient(supabaseUrl, supabaseServiceKey) : null;

// Input validation schemas for sharing
const shareWorldSchema = z.object({
  worldId: z.string().min(1, 'World ID is required'),
  worldSnapshot: z.record(z.any()).refine((data) => {
    return data && typeof data.id === 'string' && typeof data.name === 'string';
  }, 'Invalid world snapshot format'),
  expiresAt: z.string().optional() // ISO date string
});

const copySharedWorldSchema = z.object({
  shareSlug: z.string().min(1, 'Share slug is required'),
  newWorldId: z.string().min(1, 'New world ID is required')
});

/**
 * Generate a share URL for a world
 */
export async function handleShareWorld(
  worldId: string,
  worldSnapshot: any,
  userId: string,
  expiresAt?: string,
  clientIP?: string,
  writeData?: (data: string) => void,
  endResponse?: () => void
) {
  if (!supabaseAdmin) {
    throw {
      status: 500,
      error: 'Service unavailable',
      message: 'Sharing functionality is not configured'
    };
  }

  try {
    // Validate input
    const validatedInput = shareWorldSchema.parse({
      worldId,
      worldSnapshot,
      expiresAt
    });

    if (writeData) {
      writeData('data: ' + JSON.stringify({
        status: 'generating_url',
        message: 'Creating share URL...'
      }) + '\n\n');
    }

    // Generate a unique share slug
    const { data: slugData, error: slugError } = await supabaseAdmin
      .rpc('generate_share_slug');

    if (slugError || !slugData) {
      console.error('Error generating share slug:', slugError);
      throw new Error('Failed to generate share URL');
    }

    const shareSlug = slugData;

    // Calculate world metadata
    const pageCount = Object.keys(worldSnapshot.pages || {}).length;
    const worldName = worldSnapshot.name || 'Untitled World';
    const worldDescription = worldSnapshot.description || '';

    // Insert the shared world record
    const { data: sharedWorld, error: insertError } = await supabaseAdmin
      .from('shared_worlds')
      .insert({
        world_id: worldId,
        user_id: userId,
        share_url_slug: shareSlug,
        world_snapshot: worldSnapshot,
        world_name: worldName,
        world_description: worldDescription,
        page_count: pageCount,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null
      })
      .select('share_id, share_url_slug, created_at')
      .single();

    if (insertError) {
      console.error('Error inserting shared world:', insertError);
      throw new Error('Failed to create shared world');
    }

    const shareUrl = `${process.env.VITE_APP_URL || 'http://localhost:5173'}/world/${shareSlug}`;

    const responseData = {
      status: 'success',
      shareId: sharedWorld.share_id,
      shareSlug: sharedWorld.share_url_slug,
      shareUrl: shareUrl,
      createdAt: sharedWorld.created_at,
      expiresAt: expiresAt || null
    };

    if (writeData) {
      writeData('data: ' + JSON.stringify(responseData) + '\n\n');
    }

    if (endResponse) {
      endResponse();
    }

    return responseData;

  } catch (error) {
    console.error('Share world error:', error);
    if (error instanceof z.ZodError) {
      throw {
        status: 400,
        error: 'Invalid input',
        message: error.errors[0]?.message || 'Invalid input data'
      };
    }
    throw {
      status: 500,
      error: 'Failed to share world',
      message: 'An error occurred while creating the share URL'
    };
  }
}

/**
 * Get a shared world by its slug
 */
export async function handleGetSharedWorld(
  shareSlug: string,
  clientIP?: string,
  userId?: string
) {
  if (!supabaseAdmin) {
    throw {
      status: 500,
      error: 'Service unavailable',
      message: 'Sharing functionality is not configured'
    };
  }

  try {
    // Fetch the shared world
    const { data: sharedWorld, error: fetchError } = await supabaseAdmin
      .from('shared_worlds')
      .select(`
        share_id,
        world_snapshot,
        world_name,
        world_description,
        page_count,
        created_at,
        views_count,
        copies_count,
        user_id
      `)
      .eq('share_url_slug', shareSlug)
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.now()')
      .single();

    if (fetchError || !sharedWorld) {
      if (fetchError?.code === 'PGRST116') {
        throw {
          status: 404,
          error: 'Shared world not found',
          message: 'This shared world does not exist or is no longer available'
        };
      }
      console.error('Error fetching shared world:', fetchError);
      throw {
        status: 500,
        error: 'Failed to fetch shared world',
        message: 'An error occurred while loading the shared world'
      };
    }

    // Record the view (async, don't wait for it)
    if (clientIP) {
      const ipHash = createHash('sha256')
        .update(clientIP)
        .digest('hex');

      supabaseAdmin
        .rpc('increment_share_views', {
          p_share_id: sharedWorld.share_id,
          p_viewer_ip_hash: ipHash,
          p_viewer_user_id: userId || null
        })
        .then(result => {
          if (result.error) {
            console.error('Error recording view:', result.error);
          }
        });
    }

    return {
      world: sharedWorld.world_snapshot,
      metadata: {
        name: sharedWorld.world_name,
        description: sharedWorld.world_description,
        pageCount: sharedWorld.page_count,
        createdAt: sharedWorld.created_at,
        viewsCount: sharedWorld.views_count,
        copiesCount: sharedWorld.copies_count,
        isOwner: userId === sharedWorld.user_id
      }
    };

  } catch (error: any) {
    if (error.status) {
      throw error;
    }
    console.error('Get shared world error:', error);
    throw {
      status: 500,
      error: 'Failed to fetch shared world',
      message: 'An error occurred while loading the shared world'
    };
  }
}

/**
 * Copy a shared world to the user's account
 */
export async function handleCopySharedWorld(
  shareSlug: string,
  newWorldId: string,
  userId: string,
  clientIP?: string
) {
  if (!supabaseAdmin) {
    throw {
      status: 500,
      error: 'Service unavailable',
      message: 'Sharing functionality is not configured'
    };
  }

  try {
    // Validate input
    const validatedInput = copySharedWorldSchema.parse({
      shareSlug,
      newWorldId
    });

    // First, get the shared world
    const { data: sharedWorld, error: fetchError } = await supabaseAdmin
      .from('shared_worlds')
      .select('share_id, world_snapshot, user_id')
      .eq('share_url_slug', shareSlug)
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.now()')
      .single();

    if (fetchError || !sharedWorld) {
      if (fetchError?.code === 'PGRST116') {
        throw {
          status: 404,
          error: 'Shared world not found',
          message: 'This shared world does not exist or is no longer available'
        };
      }
      console.error('Error fetching shared world for copy:', fetchError);
      throw {
        status: 500,
        error: 'Failed to fetch shared world',
        message: 'An error occurred while loading the shared world'
      };
    }

    // Don't allow users to copy their own worlds
    if (sharedWorld.user_id === userId) {
      throw {
        status: 400,
        error: 'Cannot copy own world',
        message: 'You cannot copy your own shared world'
      };
    }

    // Create a modified world snapshot with the new ID
    const copiedWorld = {
      ...sharedWorld.world_snapshot,
      id: newWorldId,
      createdAt: Date.now(),
      lastModified: Date.now(),
      // Clear any sharing-related metadata from the copy
      sharedAt: undefined,
      shareUrl: undefined
    };

    // Record the copy (this also increments the copy counter)
    const { error: copyError } = await supabaseAdmin
      .rpc('record_world_copy', {
        p_share_id: sharedWorld.share_id,
        p_copied_by_user_id: userId,
        p_new_world_id: newWorldId
      });

    if (copyError) {
      console.error('Error recording world copy:', copyError);
      // Check if it's a duplicate copy attempt
      if (copyError.code === '23505') { // Unique constraint violation
        throw {
          status: 400,
          error: 'Already copied',
          message: 'You have already copied this world'
        };
      }
      throw {
        status: 500,
        error: 'Failed to record copy',
        message: 'An error occurred while copying the world'
      };
    }

    return {
      status: 'success',
      copiedWorld: copiedWorld,
      message: 'World copied successfully'
    };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw {
        status: 400,
        error: 'Invalid input',
        message: error.errors[0]?.message || 'Invalid input data'
      };
    }
    if (error.status) {
      throw error;
    }
    console.error('Copy shared world error:', error);
    throw {
      status: 500,
      error: 'Failed to copy world',
      message: 'An error occurred while copying the shared world'
    };
  }
}

/**
 * Get user's shared worlds (for management)
 */
export async function handleGetUserSharedWorlds(
  userId: string,
  clientIP?: string
) {
  if (!supabaseAdmin) {
    throw {
      status: 500,
      error: 'Service unavailable',
      message: 'Sharing functionality is not configured'
    };
  }

  try {
    const { data: sharedWorlds, error: fetchError } = await supabaseAdmin
      .from('shared_worlds')
      .select(`
        share_id,
        world_id,
        share_url_slug,
        world_name,
        world_description,
        page_count,
        created_at,
        views_count,
        copies_count,
        is_active,
        expires_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Error fetching user shared worlds:', fetchError);
      throw {
        status: 500,
        error: 'Failed to fetch shared worlds',
        message: 'An error occurred while loading your shared worlds'
      };
    }

    const baseUrl = process.env.VITE_APP_URL || 'http://localhost:5173';
    const sharesWithUrls = (sharedWorlds || []).map(share => ({
      ...share,
      shareUrl: `${baseUrl}/world/${share.share_url_slug}`
    }));

    return {
      shares: sharesWithUrls
    };

  } catch (error: any) {
    if (error.status) {
      throw error;
    }
    console.error('Get user shared worlds error:', error);
    throw {
      status: 500,
      error: 'Failed to fetch shared worlds',
      message: 'An error occurred while loading your shared worlds'
    };
  }
}

/**
 * Deactivate a shared world
 */
export async function handleDeactivateSharedWorld(
  shareId: string,
  userId: string,
  clientIP?: string
) {
  if (!supabaseAdmin) {
    throw {
      status: 500,
      error: 'Service unavailable',
      message: 'Sharing functionality is not configured'
    };
  }

  try {
    const { data: updatedShare, error: updateError } = await supabaseAdmin
      .from('shared_worlds')
      .update({ is_active: false })
      .eq('share_id', shareId)
      .eq('user_id', userId) // Ensure user owns this share
      .select('share_id')
      .single();

    if (updateError || !updatedShare) {
      if (updateError?.code === 'PGRST116') {
        throw {
          status: 404,
          error: 'Share not found',
          message: 'This share does not exist or you do not have permission to modify it'
        };
      }
      console.error('Error deactivating shared world:', updateError);
      throw {
        status: 500,
        error: 'Failed to deactivate share',
        message: 'An error occurred while deactivating the share'
      };
    }

    return {
      status: 'success',
      message: 'Share deactivated successfully'
    };

  } catch (error: any) {
    if (error.status) {
      throw error;
    }
    console.error('Deactivate shared world error:', error);
    throw {
      status: 500,
      error: 'Failed to deactivate share',
      message: 'An error occurred while deactivating the share'
    };
  }
}
