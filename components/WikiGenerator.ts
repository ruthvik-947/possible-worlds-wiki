import { WorldbuildingRecord } from './WorldbuildingHistory';
import { config } from '../lib/config';
import * as Sentry from '@sentry/react';

export interface WikiPageData {
  id: string;
  title: string;
  content: string;
  categories: string[];
  clickableTerms: string[];
  relatedConcepts: { term: string; description: string }[];
  basicFacts: { name: string; value: string }[];
  sections?: { title: string; content: string }[];
  imageUrl?: string | null;
  createdAt?: number;
  usageInfo?: {
    usageCount: number;
    dailyLimit: number;
    remaining: number;
  } | null;
  hasMetadata?: boolean;
  isPartial?: boolean;
  progress?: number;
}

export async function generateWikiPage(
  input: string,
  type: 'seed' | 'term',
  context?: string,
  worldbuildingHistory?: WorldbuildingRecord,
  onPartialUpdate?: (partialData: WikiPageData) => void,
  authToken?: string
): Promise<WikiPageData> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(config.endpoints.generate, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input,
        type,
        context,
        worldbuildingHistory
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 429 && errorData.requiresApiKey) {
        // Rate limit error - include usage info
        const error = new Error(errorData.message || 'Daily free limit reached') as any;
        error.code = 'RATE_LIMIT_EXCEEDED';
        error.usageInfo = {
          usageCount: errorData.usageCount,
          dailyLimit: errorData.dailyLimit,
          requiresApiKey: true
        };
        throw error;
      }

      if (errorData.requiresApiKey) {
        const error = new Error(errorData.message || 'API key required') as any;
        error.code = 'API_KEY_REQUIRED';
        throw error;
      }

      throw new Error('Failed to generate wiki page');
    }

    // Handle streaming response
    const streamingHeader = response.headers.get('x-streaming');

    if (streamingHeader === 'true') {
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let finalData: WikiPageData | null = null;


      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          // Decode the chunk and add to buffer
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process complete lines (ending with \n\n)
          const lines = buffer.split('\n\n');

          // Keep the last incomplete line in buffer
          buffer = lines.pop() || '';

          // Process each complete line
          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              try {
                const jsonStr = line.substring(6).trim(); // Remove 'data: ' and trim

                if (!jsonStr) {
                  if (!import.meta.env.PROD) {
                    console.warn('Empty JSON string after data: prefix');
                  }
                  continue;
                }

                const parsedObj = JSON.parse(jsonStr);

                if (parsedObj.error) {
                  throw new Error(parsedObj.error);
                }

                if (parsedObj.isPartial && onPartialUpdate) {
                  // Send partial update to UI
                  onPartialUpdate(parsedObj);
                } else if (parsedObj.isComplete) {
                  // Store final complete data
                  finalData = parsedObj;
                }
              } catch (parseError) {
                if (!import.meta.env.PROD) {
                  console.warn('Failed to parse streaming data:', parseError);
                  console.warn('Raw line:', line);
                  console.warn('JSON string:', line.substring(6));
                }
                continue;
              }
            }
          }
        }

        if (finalData) {
          return finalData;
        } else {
          throw new Error('No complete data received from stream');
        }

      } finally {
        reader.releaseLock();
      }
    } else {
      // Fallback to regular JSON response
      const data = await response.json();
      return data;
    }
  } catch (error) {
    if (import.meta.env.PROD) {
      Sentry.captureException(error, {
        tags: {
          operation: 'generate_wiki_page',
          input: input.substring(0, 50),
          type: type
        }
      });
    } else {
      console.error("Error generating wiki page:", error);
    }
    throw error;
  }
}

export async function generateSectionContent(
  sectionTitle: string,
  pageTitle: string,
  pageContent: string,
  worldbuildingHistory?: WorldbuildingRecord,
  onPartialUpdate?: (partialData: { title: string; content: string }) => void,
  authToken?: string
): Promise<{ title: string; content: string; usageInfo?: { usageCount: number; dailyLimit: number; remaining: number } | null }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(config.endpoints.generateSection, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sectionTitle,
        pageTitle,
        pageContent,
        worldbuildingHistory
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 429 && errorData.requiresApiKey) {
        // Rate limit error - include usage info
        const error = new Error(errorData.message || 'Daily free limit reached') as any;
        error.code = 'RATE_LIMIT_EXCEEDED';
        error.usageInfo = {
          usageCount: errorData.usageCount,
          dailyLimit: errorData.dailyLimit,
          requiresApiKey: true
        };
        throw error;
      }

      if (errorData.requiresApiKey) {
        const error = new Error(errorData.message || 'API key required') as any;
        error.code = 'API_KEY_REQUIRED';
        throw error;
      }

      throw new Error('Failed to generate section content');
    }

    // Handle streaming response
    if (response.headers.get('x-streaming') === 'true') {
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let finalData: any = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode the chunk and add to buffer
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process complete lines (ending with \n\n)
          const lines = buffer.split('\n\n');

          // Keep the last incomplete line in buffer
          buffer = lines.pop() || '';

          // Process each complete line
          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              try {
                const jsonStr = line.substring(6); // Remove 'data: '
                const parsedObj = JSON.parse(jsonStr);

                if (parsedObj.error) {
                  throw new Error(parsedObj.error);
                }

                if (parsedObj.isPartial && onPartialUpdate) {
                  // Send partial update to UI
                  onPartialUpdate({
                    title: parsedObj.title,
                    content: parsedObj.content
                  });
                } else if (parsedObj.isComplete) {
                  // Store final complete data
                  finalData = parsedObj;
                }
              } catch (parseError) {
                if (!import.meta.env.PROD) {
                  console.warn('Failed to parse streaming section data:', parseError);
                }
                continue;
              }
            }
          }
        }

        if (finalData) {
          return finalData;
        } else {
          throw new Error('No complete data received from stream');
        }

      } finally {
        reader.releaseLock();
      }
    } else {
      // Fallback to regular JSON response
      const data = await response.json();
      return data;
    }
  } catch (error) {
    if (import.meta.env.PROD) {
      Sentry.captureException(error, {
        tags: {
          operation: 'generate_section_content',
          sectionTitle: sectionTitle,
          pageTitle: pageTitle
        }
      });
    } else {
      console.error("Error generating section content:", error);
    }
    throw error;
  }
}

export async function generatePageImage(
  pageTitle: string,
  pageContent: string,
  worldbuildingHistory?: WorldbuildingRecord,
  onProgress?: (progress: { status: string; progress: number; message: string }) => void,
  authToken?: string,
  worldId?: string,
  pageId?: string
): Promise<{ imageUrl: string; usageInfo?: { usageCount: number; dailyLimit: number; remaining: number } | null }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(config.endpoints.generateImage || '/api/generate-image', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pageTitle,
        pageContent,
        worldbuildingHistory,
        worldId,
        pageId
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 429 && errorData.requiresApiKey) {
        const error = new Error(errorData.message || 'Daily free limit reached') as any;
        error.code = 'RATE_LIMIT_EXCEEDED';
        error.usageInfo = {
          usageCount: errorData.usageCount,
          dailyLimit: errorData.dailyLimit,
          requiresApiKey: true
        };
        throw error;
      }

      if (errorData.requiresApiKey) {
        const error = new Error(errorData.message || 'API key required') as any;
        error.code = 'API_KEY_REQUIRED';
        throw error;
      }

      throw new Error(errorData.message || 'Failed to generate image');
    }

    // Handle streaming response
    if (response.headers.get('X-Streaming') === 'true') {
      const reader = response.body!.getReader();
      let finalData: any = null;
      let buffer = ''; // Buffer for incomplete JSON

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = new TextDecoder().decode(value);
          buffer += chunk;

          // Split by lines and keep incomplete line in buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last (potentially incomplete) line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = line.slice(6);
                if (data.trim() === '') continue; // Skip empty data lines

                const parsedObj = JSON.parse(data);

                if (parsedObj.status === 'generating' && onProgress) {
                  onProgress(parsedObj);
                } else if (parsedObj.status === 'complete') {
                  finalData = parsedObj;
                }
              } catch (parseError) {
                const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                if (!import.meta.env.PROD) {
                  console.warn('Failed to parse streaming image data:', errorMessage.substring(0, 100));
                }
                continue;
              }
            }
          }
        }

        // Process any remaining data in buffer
        if (buffer && buffer.startsWith('data: ')) {
          try {
            const data = buffer.slice(6);
            if (data.trim()) {
              const parsedObj = JSON.parse(data);
              if (parsedObj.status === 'complete') {
                finalData = parsedObj;
              }
            }
          } catch (parseError) {
            if (!import.meta.env.PROD) {
              console.warn('Failed to parse final buffered data:', parseError);
            }
          }
        }

        if (finalData) {
          return {
            imageUrl: finalData.imageUrl,
            usageInfo: finalData.usageInfo
          };
        } else {
          throw new Error('No complete data received from stream');
        }

      } finally {
        reader.releaseLock();
      }
    } else {
      const data = await response.json();
      return {
        imageUrl: data.imageUrl,
        usageInfo: data.usageInfo
      };
    }
  } catch (error) {
    if (import.meta.env.PROD) {
      Sentry.captureException(error, {
        tags: {
          operation: 'generate_page_image',
          title: title,
          description: description.substring(0, 100)
        }
      });
    } else {
      console.error("Error generating image:", error);
    }
    throw error;
  }
}
