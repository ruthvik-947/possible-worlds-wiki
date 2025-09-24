import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { WikiPageData, generateWikiPage } from '../components/WikiGenerator';
import { World, updateWorldMetadata } from '../components/WorldModel';
import { updateWorldbuildingHistory } from '../components/WorldbuildingHistory';

export interface UsePageGenerationReturn {
  isLoading: boolean;
  isStreaming: boolean;
  streamingPageData: WikiPageData | null;
  errorMessage: string | null;
  handleTermClick: (term: string, context: string) => Promise<void>;
  generateFirstPageWithSeed: (seed: string) => Promise<void>;
  handleImageGenerated: (pageId: string, imageUrl: string) => void;
  handleSectionAdded: (pageId: string, section: { title: string; content: string }) => void;
}

export function usePageGeneration(
  pages: Map<string, WikiPageData>,
  setPages: React.Dispatch<React.SetStateAction<Map<string, WikiPageData>>>,
  currentWorld: World,
  setCurrentWorld: React.Dispatch<React.SetStateAction<World>>,
  currentPageId: string | null,
  setCurrentPageId: React.Dispatch<React.SetStateAction<string | null>>,
  pageHistory: string[],
  setPageHistory: React.Dispatch<React.SetStateAction<string[]>>,
  requireAuthToken: () => Promise<string>,
  showApiKeyRequiredToast: () => void,
  enableUserApiKeys: boolean,
  setCurrentUsageInfo: (info: any) => void,
  performAutoSave: () => Promise<void>
): UsePageGenerationReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [streamingPageData, setStreamingPageData] = useState<WikiPageData | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const navigateToPage = useCallback((pageId: string) => {
    if (currentPageId) {
      setPageHistory(prev => [...prev, currentPageId]);
    }
    setCurrentPageId(pageId);
  }, [currentPageId, setPageHistory, setCurrentPageId]);

  const handleTermClick = useCallback(async (term: string, context: string) => {

    // Check if page already exists
    const existingPageId = Array.from(pages.keys()).find(id =>
      pages.get(id)?.title.toLowerCase() === term.toLowerCase()
    );

    if (existingPageId) {
      navigateToPage(existingPageId);
      return;
    }

    // Check if we've reached the page limit (25 pages per world)
    if (pages.size >= 25) {
      toast.error('World page limit reached', {
        description: 'Each world is limited to a maximum of 25 pages.',
        duration: 5000
      });
      return;
    }

    // Generate new page
    setIsLoading(true);
    setIsStreaming(true);
    setErrorMessage(null);
    setStreamingPageData(null);

    try {
      const authToken = await requireAuthToken();
      const newPage = await generateWikiPage(
        term,
        'term',
        context,
        currentWorld.worldbuilding,
        // Streaming callback
        (partialData: WikiPageData) => {
          setStreamingPageData(partialData);
        },
        authToken
      );

      // Add creation timestamp
      newPage.createdAt = Date.now();

      // Update usage info from response
      if (newPage.usageInfo) {
        setCurrentUsageInfo(newPage.usageInfo);
      }

      // Update worldbuilding history with the new page
      const updatedWorldbuilding = updateWorldbuildingHistory(
        currentWorld.worldbuilding,
        newPage.categories,
        newPage.content,
        newPage.title
      );

      // Update world with new worldbuilding data
      const updatedWorld = updateWorldMetadata({
        ...currentWorld,
        worldbuilding: updatedWorldbuilding
      });

      const newPages = new Map(pages);
      newPages.set(newPage.id, newPage);

      setPages(newPages);
      setCurrentWorld(updatedWorld);
      navigateToPage(newPage.id);
      setStreamingPageData(null); // Clear streaming data when complete

      // Directly trigger auto-save after page generation completes
      setTimeout(() => performAutoSave(), 100);
    } catch (error: any) {
      console.error('Error generating page:', error);
      if (error instanceof Error && error.message.includes('authentication token')) {
        setErrorMessage(error.message);
      } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
        setErrorMessage(error.message);
        if (error.usageInfo) {
          setCurrentUsageInfo(error.usageInfo);
        }
        if (enableUserApiKeys) {
          showApiKeyRequiredToast();
        }
      } else if (error.code === 'API_KEY_REQUIRED') {
        setErrorMessage(error.message);
        if (enableUserApiKeys) {
          showApiKeyRequiredToast();
        }
      } else {
        setErrorMessage('Failed to generate wiki page. Please try again.');
      }
      setStreamingPageData(null);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [pages, currentWorld, navigateToPage, requireAuthToken, showApiKeyRequiredToast, enableUserApiKeys, setPages, setCurrentWorld, setCurrentUsageInfo, performAutoSave]);

  const generateFirstPageWithSeed = useCallback(async (seed: string) => {
    const { createNewWorld } = require('../components/WorldModel');

    // Always start fresh - clear existing world state
    const newWorld = createNewWorld();
    setCurrentWorld(newWorld);
    setPages(new Map());
    setCurrentPageId(null);
    setPageHistory([]);

    setIsLoading(true);
    setIsStreaming(true);
    setErrorMessage(null);
    setStreamingPageData(null);

    try {
      const authToken = await requireAuthToken();
      const firstPage = await generateWikiPage(
        seed,
        'seed',
        undefined,
        newWorld.worldbuilding,
        // Streaming callback
        (partialData: WikiPageData) => {
          setStreamingPageData(partialData);

          // If this is the first callback with metadata, set up the page immediately
          if (partialData.hasMetadata && !currentPageId) {
            setCurrentPageId(partialData.id);
            setPageHistory([partialData.id]);

            // Add initial page data to map so WikiPage can render
            const initialPages = new Map();
            initialPages.set(partialData.id, partialData);
            setPages(initialPages);
          }
        },
        authToken
      );

      // Add creation timestamp
      firstPage.createdAt = Date.now();

      // Update usage info from response
      if (firstPage.usageInfo) {
        setCurrentUsageInfo(firstPage.usageInfo);
      }

      // Update worldbuilding history with the new page
      const updatedWorldbuilding = updateWorldbuildingHistory(
        newWorld.worldbuilding,
        firstPage.categories,
        firstPage.content,
        firstPage.title
      );

      // Update world with new worldbuilding data
      const updatedWorld = updateWorldMetadata({
        ...newWorld,
        worldbuilding: updatedWorldbuilding
      });

      // Update with final complete data
      const finalPages = new Map();
      finalPages.set(firstPage.id, firstPage);

      setPages(finalPages);
      setCurrentWorld(updatedWorld);
      setStreamingPageData(null); // Clear streaming data when complete

      // Directly trigger auto-save after seed page generation completes
      setTimeout(() => performAutoSave(), 100);
    } catch (error: any) {
      console.error('Error generating first page:', error);
      if (error instanceof Error && error.message.includes('authentication token')) {
        setErrorMessage(error.message);
      } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
        setErrorMessage(error.message);
        if (error.usageInfo) {
          setCurrentUsageInfo(error.usageInfo);
        }
        if (enableUserApiKeys) {
          showApiKeyRequiredToast();
        }
      } else if (error.code === 'API_KEY_REQUIRED') {
        setErrorMessage(error.message);
        if (enableUserApiKeys) {
          showApiKeyRequiredToast();
        }
      } else {
        setErrorMessage('Failed to generate wiki page. Please try again.');
      }
      setStreamingPageData(null);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [currentPageId, setPages, setCurrentPageId, setPageHistory, setCurrentWorld, requireAuthToken, showApiKeyRequiredToast, enableUserApiKeys, setCurrentUsageInfo, performAutoSave]);

  const handleImageGenerated = useCallback((pageId: string, imageUrl: string) => {
    setPages(prev => {
      const updated = new Map(prev);
      const existingPage = updated.get(pageId);
      if (existingPage) {
        updated.set(pageId, { ...existingPage, imageUrl });
      }
      return updated;
    });

    // Trigger auto-save after image is generated
    setTimeout(() => performAutoSave(), 100);
  }, [setPages, performAutoSave]);

  const handleSectionAdded = useCallback((pageId: string, section: { title: string; content: string }) => {
    // Update the page in the pages map to include the new section
    setPages(prev => {
      const updated = new Map(prev);
      const existingPage = updated.get(pageId);
      if (existingPage) {
        const updatedSections = [...(existingPage.sections || []), section];
        updated.set(pageId, { ...existingPage, sections: updatedSections });
      }
      return updated;
    });

    // Trigger auto-save after section is added
    setTimeout(() => performAutoSave(), 100);
  }, [setPages, performAutoSave]);

  return {
    isLoading,
    isStreaming,
    streamingPageData,
    errorMessage,
    handleTermClick,
    generateFirstPageWithSeed,
    handleImageGenerated,
    handleSectionAdded
  };
}