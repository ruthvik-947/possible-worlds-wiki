import { WorldbuildingRecord } from './WorldbuildingHistory';
import { config } from '../lib/config';

export interface WikiPageData {
  id: string;
  title: string;
  content: string;
  categories: string[];
  clickableTerms: string[];
  relatedConcepts: { term: string; description: string }[];
  basicFacts: { name: string; value: string }[];
  sections?: { title: string; content: string }[];
}

export async function generateWikiPage(
  input: string, 
  type: 'seed' | 'term', 
  context?: string,
  worldbuildingHistory?: WorldbuildingRecord,
  sessionId?: string
): Promise<WikiPageData> {
  try {
    const response = await fetch(config.endpoints.generate, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        input, 
        type, 
        context,
        worldbuildingHistory,
        sessionId
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate wiki page');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error generating wiki page:", error);
    // You might want to return a default error page data or re-throw the error
    throw error;
  }
}

export async function generateSectionContent(
  sectionTitle: string,
  pageTitle: string,
  pageContent: string,
  worldbuildingHistory?: WorldbuildingRecord,
  sessionId?: string
): Promise<{ title: string; content: string }> {
  try {
    const response = await fetch(config.endpoints.generateSection, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        sectionTitle,
        pageTitle,
        pageContent,
        worldbuildingHistory,
        sessionId
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate section content');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error generating section content:", error);
    throw error;
  }
}