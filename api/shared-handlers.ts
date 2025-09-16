// Shared API handlers that work with both Express and Vercel
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  activeApiKeys,
  allCategories,
  getWorldbuildingContext,
  capitalizeTitle,
  hasExceededFreeLimit,
  incrementUsageForIP,
  getUsageForIP,
  FREE_TIER_DAILY_LIMIT
} from './utils/shared.js';

// Helper functions to parse JSON-at-the-end format
export function extractContentAndJSON(text: string): { content: string; jsonData: any | null; isComplete: boolean } {
  // Look for the last JSON block that starts with { and ends with }
  // We need to handle cases where there might be partial JSON at the end
  const lastOpenBrace = text.lastIndexOf('{');
  const lastCloseBrace = text.lastIndexOf('}');

  if (lastOpenBrace !== -1 && lastCloseBrace > lastOpenBrace) {
    // We have a complete JSON block
    const jsonStr = text.substring(lastOpenBrace, lastCloseBrace + 1);
    try {
      const jsonData = JSON.parse(jsonStr);
      // Remove the JSON block from the content
      const content = text.substring(0, lastOpenBrace).trim();

      return {
        content,
        jsonData,
        isComplete: true
      };
    } catch (e) {
      // JSON is malformed, but we can still extract content before it
      const content = text.substring(0, lastOpenBrace).trim();
      return {
        content,
        jsonData: null,
        isComplete: false
      };
    }
  } else if (lastOpenBrace !== -1 && lastCloseBrace <= lastOpenBrace) {
    // JSON block started but not complete yet
    const content = text.substring(0, lastOpenBrace).trim();
    return {
      content,
      jsonData: null,
      isComplete: false
    };
  }

  // No JSON found yet, return all as content
  return {
    content: text.trim(),
    jsonData: null,
    isComplete: false
  };
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
        message: `You've used ${usage.count}/${FREE_TIER_DAILY_LIMIT} free generations today. Please provide your own API key for unlimited usage.`,
        usageCount: usage.count,
        dailyLimit: FREE_TIER_DAILY_LIMIT,
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

  console.log('Starting generation request for:', title);
  console.log('About to call streamText');

  const result = await streamText({
    model: model,
    prompt: `You are a worldbuilding agent. You are deeply knowledgeable about history, mythology, cosmology, philosophy, science, and anthropology from around the world (not only the West), and have a Borgesian, and Pratchett-like imagination and a von-Neumann-esque sense of order. Generate a wiki page for a topic within a possible universe. Do not imply that this universe is fictional! To you and the user it is real.

    The user has provided the following input: "${input}"
    This is a ${type === 'seed' ? 'seed sentence to start the wiki' : `term to expand upon`}.
    ${context ? `The context for this term is: "${context}"` : ''}
    ${worldbuildingHistory ? `Existing worldbuilding context: "${getWorldbuildingContext(worldbuildingHistory)}"` : ''}

    Write a detailed and engaging encyclopedic article about "${title}". Write 3-4 paragraphs of rich, descriptive content that brings this topic to life. Be matter-of-fact and authoritative, no matter how fantastical the subject. ${worldbuildingHistory ? 'Ensure consistency with the existing worldbuilding context provided.' : ''}

    After completing the article, you MUST end with a JSON metadata block. Put the JSON on a new line after your article content:

    {
      "categories": ["category1", "category2"],
      "clickableTerms": ["term1", "term2", "term3"],
      "relatedConcepts": [{"term": "concept1", "description": "description1"}],
      "basicFacts": [{"name": "fact1", "value": "value1"}]
    }

    For categories, choose 2-4 from: ${allCategories.join(', ')}
    For clickableTerms, list 5-8 specific nouns/concepts from your content that would be interesting to explore further.
    For relatedConcepts, list 2-4 related topics not directly mentioned in the content.
    For basicFacts, list 3-4 key facts about the topic.

    CRITICAL: You must complete the entire JSON block including the closing brace }. Do not truncate or leave incomplete. Write the full article text first, then the complete JSON metadata.`
  });

  let accumulatedText = '';
  const pageId = Math.random().toString(36).substring(2, 11);

  console.log('Starting to process textStream');
  for await (const textDelta of result.textStream) {
    accumulatedText += textDelta;
    console.log('Received textDelta:', textDelta.length, 'chars');

    // Parse content and JSON as they complete
    const parseResult = extractContentAndJSON(accumulatedText);
    const metadata = parseResult.jsonData ? parseMetadata(parseResult.jsonData) : {
      categories: [],
      clickableTerms: [],
      relatedConcepts: [],
      basicFacts: []
    };

    // Add debug logging for streaming progress
    if (accumulatedText.length > 500) {
      console.log('Current accumulated text length:', accumulatedText.length);
      console.log('Parse result:', {
        contentLength: parseResult.content.length,
        hasJSON: !!parseResult.jsonData,
        isComplete: parseResult.isComplete,
        metadataCounts: {
          categories: metadata.categories.length,
          clickableTerms: metadata.clickableTerms.length,
          relatedConcepts: metadata.relatedConcepts.length,
          basicFacts: metadata.basicFacts.length
        }
      });
    }

    // Send update on every textDelta for maximum streaming effect
    const partialData = {
      id: pageId,
      title,
      content: parseResult.content,
      categories: metadata.categories,
      clickableTerms: metadata.clickableTerms,
      relatedConcepts: metadata.relatedConcepts,
      basicFacts: metadata.basicFacts,
      isPartial: !parseResult.isComplete,
      hasMetadata: !!parseResult.jsonData,
      progress: Math.min(90, Math.floor((accumulatedText.length / 2500) * 100))
    };

    if (writeData) {
      writeData('data: ' + JSON.stringify(partialData) + '\n\n');
    }
    console.log('Sent streaming update, content length:', parseResult.content.length);
  }

  // Parse final complete response
  const finalParseResult = extractContentAndJSON(accumulatedText);
  const finalMetadata = finalParseResult.jsonData ? parseMetadata(finalParseResult.jsonData) : {
    categories: [],
    clickableTerms: [],
    relatedConcepts: [],
    basicFacts: []
  };

  console.log('Final text processing complete. Parse result:', {
    contentLength: finalParseResult.content.length,
    hasJSON: !!finalParseResult.jsonData,
    isComplete: finalParseResult.isComplete,
    metadataCounts: {
      categories: finalMetadata.categories.length,
      clickableTerms: finalMetadata.clickableTerms.length,
      relatedConcepts: finalMetadata.relatedConcepts.length,
      basicFacts: finalMetadata.basicFacts.length
    }
  });

  // If we don't have complete JSON, log for debugging
  if (!finalParseResult.isComplete) {
    console.log('WARNING: JSON not complete. Final accumulated text sample:');
    console.log(accumulatedText.substring(Math.max(0, accumulatedText.length - 1000)));
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
    content: finalParseResult.content,
    categories: finalMetadata.categories,
    clickableTerms: finalMetadata.clickableTerms,
    relatedConcepts: finalMetadata.relatedConcepts,
    basicFacts: finalMetadata.basicFacts,
    isPartial: false,
    isComplete: true,
    hasMetadata: !!finalParseResult.jsonData,
    usageInfo: hasUserApiKey ? null : {
      usageCount: currentUsage.count,
      dailyLimit: FREE_TIER_DAILY_LIMIT,
      remaining: FREE_TIER_DAILY_LIMIT - currentUsage.count
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
        message: `You've used ${usage.count}/${FREE_TIER_DAILY_LIMIT} free generations today. Please provide your own API key for unlimited usage.`,
        usageCount: usage.count,
        dailyLimit: FREE_TIER_DAILY_LIMIT,
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

  console.log('Starting section generation for:', capitalizedSectionTitle);
  console.log('About to call streamText for section');

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

  console.log('Starting to process section textStream');
  for await (const textDelta of result.textStream) {
    accumulatedText += textDelta;
    console.log('Section received textDelta:', textDelta.length, 'chars');

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
    console.log('Sent section streaming update, length:', accumulatedText.length);
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
      dailyLimit: FREE_TIER_DAILY_LIMIT,
      remaining: FREE_TIER_DAILY_LIMIT - currentUsage.count
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