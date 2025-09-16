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

// Helper functions to extract sections from streamed text
export function extractSection(text: string, startMarker: string, endMarker: string | null): string | null {
  // Try exact match first
  let startIndex = text.indexOf(startMarker);

  // If exact match fails, try case-insensitive search
  if (startIndex === -1) {
    const lowerText = text.toLowerCase();
    const lowerMarker = startMarker.toLowerCase();
    const lowerStartIndex = lowerText.indexOf(lowerMarker);
    if (lowerStartIndex !== -1) {
      startIndex = lowerStartIndex;
    }
  }

  if (startIndex === -1) return null;

  const contentStart = startIndex + startMarker.length;
  let content = '';

  if (endMarker) {
    let endIndex = text.indexOf(endMarker, contentStart);

    // Try case-insensitive search for end marker
    if (endIndex === -1) {
      const lowerText = text.toLowerCase();
      const lowerEndMarker = endMarker.toLowerCase();
      endIndex = lowerText.indexOf(lowerEndMarker, contentStart);
    }

    if (endIndex === -1) {
      content = text.substring(contentStart);
    } else {
      content = text.substring(contentStart, endIndex);
    }
  } else {
    content = text.substring(contentStart);
  }

  return content.trim();
}

export function extractList(text: string, startMarker: string, endMarker: string | null): string[] {
  const section = extractSection(text, startMarker, endMarker);
  if (!section) return [];

  return section
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      // Filter out empty lines, section headers, and unwanted characters
      return line.length > 0 &&
             !line.toLowerCase().includes('categories:') &&
             !line.toLowerCase().includes('clickable_terms:') &&
             !line.toLowerCase().includes('related_concepts:') &&
             !line.toLowerCase().includes('basic_facts:') &&
             !line.toLowerCase().includes('content:') &&
             !line.match(/^#+$/) && // Remove lines with only hash characters
             !line.match(/^[-•*]+$/) && // Remove lines with only list markers
             line !== '##' && line !== '#' && line !== '---';
    })
    .map(line => {
      // Remove common list prefixes and clean up
      return line.replace(/^[-•*]\s*/, '').replace(/#+$/, '').trim();
    })
    .filter(line => line.length > 0); // Remove any empty lines after processing
}

export function extractKeyValueList(text: string, startMarker: string, endMarker: string | null): Array<{term?: string; description?: string; name?: string; value?: string}> {
  const section = extractSection(text, startMarker, endMarker);
  if (!section) return [];

  const isRelatedConcepts = startMarker.toLowerCase().includes('related');

  return section
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      // Filter out empty lines, section headers, and unwanted characters
      return line.length > 0 &&
             !line.toLowerCase().includes('categories:') &&
             !line.toLowerCase().includes('clickable_terms:') &&
             !line.toLowerCase().includes('related_concepts:') &&
             !line.toLowerCase().includes('basic_facts:') &&
             !line.toLowerCase().includes('content:') &&
             !line.match(/^#+$/) && // Remove lines with only hash characters
             !line.match(/^[-•*]+$/) && // Remove lines with only list markers
             line !== '##' && line !== '#' && line !== '---';
    })
    .map(line => {
      // Remove common list prefixes and clean up
      line = line.replace(/^[-•*]\s*/, '').replace(/#+$/, '').trim();

      // Try different separators: |, :, -
      let key = '', value = '';
      if (line.includes('|')) {
        [key, value] = line.split('|', 2).map(s => s.trim());
      } else if (line.includes(':')) {
        [key, value] = line.split(':', 2).map(s => s.trim());
      } else if (line.includes(' - ')) {
        [key, value] = line.split(' - ', 2).map(s => s.trim());
      } else {
        // If no separator found, treat the whole line as the key/term
        key = line;
        value = '';
      }

      // Clean up key and value
      key = key.replace(/^[-•*]\s*/, '').trim();
      value = value.replace(/^[-•*]\s*/, '').trim();

      if (isRelatedConcepts) {
        return { term: key, description: value };
      } else {
        return { name: key, value: value };
      }
    })
    .filter(item => (item.term || item.name) && (item.term || item.name).length > 0);
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

    Generate a wiki page titled "${title}" with the following EXACT structure and format:

    CONTENT:
    Write 3-4 paragraphs of detailed and engaging encyclopedic content. Be descriptive and matter-of-fact, no matter how absurd the topic. ${worldbuildingHistory ? 'Ensure consistency with the existing worldbuilding context provided.' : ''}

    CATEGORIES:
    ${allCategories.slice(0, 8).join('\n')}
    Pick 2-4 of the above categories that best fit your content. List them one per line, like:
    Technology
    Culture

    CLICKABLE_TERMS:
    List 5-8 specific nouns, concepts, or names from your content that would be interesting to explore further. These must be exact phrases from the content. List them one per line, like:
    Language Scientists
    Temporal Accordions
    Time-Writing Harmonies

    RELATED_CONCEPTS:
    List 2-4 related topics not directly in the content. Format: term | description
    Temporal Mechanics | The study of time manipulation technologies
    Chrono-archaeologists | Scholars who study artifacts from different time periods

    BASIC_FACTS:
    List 3-4 basic facts. Format: fact_name | fact_value
    Year of Discovery | 2157 CE
    Primary Location | China East
    Population | 12,000 inhabitants

    IMPORTANT: You must include ALL sections with their exact headers (CONTENT:, CATEGORIES:, CLICKABLE_TERMS:, RELATED_CONCEPTS:, BASIC_FACTS:). Do not end abruptly or use ## symbols. Write naturally, not in JSON format.`
  });

  let accumulatedText = '';
  const pageId = Math.random().toString(36).substring(2, 11);

  console.log('Starting to process textStream');
  for await (const textDelta of result.textStream) {
    accumulatedText += textDelta;
    console.log('Received textDelta:', textDelta.length, 'chars');

    // Parse sections as they complete
    const sections = {
      content: extractSection(accumulatedText, 'CONTENT:', 'CATEGORIES:') || '',
      categories: extractList(accumulatedText, 'CATEGORIES:', 'CLICKABLE_TERMS:') || [],
      clickableTerms: extractList(accumulatedText, 'CLICKABLE_TERMS:', 'RELATED_CONCEPTS:') || [],
      relatedConcepts: extractKeyValueList(accumulatedText, 'RELATED_CONCEPTS:', 'BASIC_FACTS:') || [],
      basicFacts: extractKeyValueList(accumulatedText, 'BASIC_FACTS:', null) || []
    };

    // Add debug logging for empty sections
    if (accumulatedText.length > 500) {
      console.log('Current accumulated text length:', accumulatedText.length);
      console.log('Sections extracted:', {
        contentLength: sections.content.length,
        categoriesCount: sections.categories.length,
        clickableTermsCount: sections.clickableTerms.length,
        relatedConceptsCount: sections.relatedConcepts.length,
        basicFactsCount: sections.basicFacts.length
      });
    }

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

    if (writeData) {
      writeData('data: ' + JSON.stringify(partialData) + '\n\n');
    }
    console.log('Sent streaming update, content length:', sections.content.length);
  }

  // Parse final complete response
  const finalSections = {
    content: extractSection(accumulatedText, 'CONTENT:', 'CATEGORIES:') || '',
    categories: extractList(accumulatedText, 'CATEGORIES:', 'CLICKABLE_TERMS:') || [],
    clickableTerms: extractList(accumulatedText, 'CLICKABLE_TERMS:', 'RELATED_CONCEPTS:') || [],
    relatedConcepts: extractKeyValueList(accumulatedText, 'RELATED_CONCEPTS:', 'BASIC_FACTS:') || [],
    basicFacts: extractKeyValueList(accumulatedText, 'BASIC_FACTS:', null) || []
  };

  console.log('Final text processing complete. Final sections:', {
    contentLength: finalSections.content.length,
    categoriesCount: finalSections.categories.length,
    clickableTermsCount: finalSections.clickableTerms.length,
    relatedConceptsCount: finalSections.relatedConcepts.length,
    basicFactsCount: finalSections.basicFacts.length
  });

  // If we have very few extracted items, log the raw text for debugging
  if (finalSections.categories.length === 0 || finalSections.clickableTerms.length === 0) {
    console.log('WARNING: Low extraction count. Final accumulated text sample:');
    console.log(accumulatedText.substring(Math.max(0, accumulatedText.length - 1500)));

    // Debug each section extraction
    console.log('\n=== DEBUG SECTION EXTRACTION ===');
    console.log('CATEGORIES section:', extractSection(accumulatedText, 'CATEGORIES:', 'CLICKABLE_TERMS:'));
    console.log('CLICKABLE_TERMS section:', extractSection(accumulatedText, 'CLICKABLE_TERMS:', 'RELATED_CONCEPTS:'));
    console.log('RELATED_CONCEPTS section:', extractSection(accumulatedText, 'RELATED_CONCEPTS:', 'BASIC_FACTS:'));
    console.log('BASIC_FACTS section:', extractSection(accumulatedText, 'BASIC_FACTS:', null));
    console.log('=== END DEBUG ===\n');
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
    ...finalSections,
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