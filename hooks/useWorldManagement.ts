import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { World, createNewWorld, updateWorldMetadata, importWorld } from '../components/WorldModel';
import { WikiPageData } from '../components/WikiGenerator';
import { saveWorldToServer } from '../lib/worldService';
import { AutoSaveInfo } from '../components/WorldManager';

export interface UseWorldManagementReturn {
  currentWorld: World;
  setCurrentWorld: React.Dispatch<React.SetStateAction<World>>;
  autoSaveInfo: AutoSaveInfo;
  handleLoadWorld: (loadedWorld: World) => void;
  handleNewWorld: () => void;
  handleImportWorld: (event: React.ChangeEvent<HTMLInputElement>) => void;
  performAutoSave: () => Promise<void>;
  isEditingWorldName: boolean;
  setIsEditingWorldName: (editing: boolean) => void;
  editedWorldName: string;
  setEditedWorldName: (name: string) => void;
}

export function useWorldManagement(
  pages: Map<string, WikiPageData>,
  currentPageId: string | null,
  pageHistory: string[],
  requireAuthToken: () => Promise<string>,
  setPages: React.Dispatch<React.SetStateAction<Map<string, WikiPageData>>>,
  setCurrentPageId: React.Dispatch<React.SetStateAction<string | null>>,
  setPageHistory: React.Dispatch<React.SetStateAction<string[]>>,
  setIsLoading: (loading: boolean) => void
): UseWorldManagementReturn {
  const [currentWorld, setCurrentWorld] = useState<World>(createNewWorld());
  const [isEditingWorldName, setIsEditingWorldName] = useState(false);
  const [editedWorldName, setEditedWorldName] = useState('');
  const [autoSaveInfo, setAutoSaveInfo] = useState<AutoSaveInfo>({ status: 'idle' });
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const latestWorldRef = useRef<World>(currentWorld);
  const lastSerializedRef = useRef<string>('');

  // Update world when pages/navigation changes
  useEffect(() => {
    setCurrentWorld(prev => ({
      ...prev,
      pages: Object.fromEntries(pages),
      currentPageId,
      pageHistory
    }));
  }, [pages, currentPageId, pageHistory]);

  // Keep ref in sync
  useEffect(() => {
    latestWorldRef.current = {
      ...currentWorld,
      pages: Object.fromEntries(pages),
      currentPageId,
      pageHistory
    };
  }, [currentWorld, pages, currentPageId, pageHistory]);

  const performAutoSave = useCallback(async () => {
    if (!isAuthLoaded || !isSignedIn) {
      return;
    }

    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    const snapshot = latestWorldRef.current;
    const pageCount = Object.keys(snapshot.pages || {}).length;

    if (pageCount === 0) {
      return;
    }

    try {
      setAutoSaveInfo(prev => ({ status: 'saving', timestamp: prev.timestamp }));
      const token = await requireAuthToken();

      const worldToSave = updateWorldMetadata({
        ...snapshot,
        lastModified: Date.now()
      });

      latestWorldRef.current = worldToSave;
      setCurrentWorld(worldToSave);
      const serialized = JSON.stringify(worldToSave);
      lastSerializedRef.current = serialized;

      await saveWorldToServer(token, worldToSave);
      setAutoSaveInfo({ status: 'saved', timestamp: Date.now() });
    } catch (error: any) {
      console.error('Auto-save failed:', error);
      const message = error?.message || 'Auto-save failed';
      setAutoSaveInfo({ status: 'error', error: message });
    }
  }, [isAuthLoaded, isSignedIn, requireAuthToken]);

  // Auto-save effect
  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn) {
      if (autoSaveTimeoutRef.current !== null) {
        window.clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
      return;
    }

    const snapshot = {
      ...currentWorld,
      pages: Object.fromEntries(pages),
      currentPageId,
      pageHistory
    };

    latestWorldRef.current = snapshot;
    const serialized = JSON.stringify(snapshot);

    const pageCount = Object.keys(snapshot.pages || {}).length;
    if (pageCount === 0) {
      if (autoSaveInfo.status !== 'idle') {
        setAutoSaveInfo({ status: 'idle' });
      }
      lastSerializedRef.current = serialized;
      if (autoSaveTimeoutRef.current !== null) {
        window.clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
      return;
    }

    const dataChanged = serialized !== lastSerializedRef.current;
    const shouldSchedule = dataChanged || autoSaveInfo.status === 'error';

    if (!shouldSchedule) {
      return;
    }

    // Only update the reference after we've decided to schedule
    lastSerializedRef.current = serialized;

    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = window.setTimeout(() => {
      autoSaveTimeoutRef.current = null;
      void performAutoSave();
    }, 3000);

    return () => {
      if (autoSaveTimeoutRef.current !== null) {
        window.clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [pages, currentWorld, currentPageId, pageHistory, isAuthLoaded, isSignedIn, performAutoSave, autoSaveInfo.status]);

  const handleLoadWorld = useCallback((loadedWorld: World) => {
    const loadedPages = new Map<string, WikiPageData>(Object.entries(loadedWorld.pages || {}));
    latestWorldRef.current = loadedWorld;
    lastSerializedRef.current = JSON.stringify(loadedWorld);
    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    setPages(loadedPages);
    setCurrentWorld(loadedWorld);
    setCurrentPageId(loadedWorld.currentPageId || null);
    setPageHistory(loadedWorld.pageHistory || []);
    const loadedPageCount = Object.keys(loadedWorld.pages || {}).length;
    if (loadedPageCount > 0) {
      setAutoSaveInfo({ status: 'saved', timestamp: loadedWorld.lastModified || Date.now() });
    } else {
      setAutoSaveInfo({ status: 'idle' });
    }
  }, [setPages, setCurrentPageId, setPageHistory]);

  const handleNewWorld = useCallback(() => {
    const freshWorld = createNewWorld();
    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    latestWorldRef.current = freshWorld;
    lastSerializedRef.current = JSON.stringify(freshWorld);
    setAutoSaveInfo({ status: 'idle' });
    setPages(new Map());
    setCurrentPageId(null);
    setPageHistory([]);
    setCurrentWorld(freshWorld);
  }, [setPages, setCurrentPageId, setPageHistory]);

  const handleImportWorld = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);

    importWorld(file)
      .then((importedWorld) => {
        const importedPages = new Map<string, WikiPageData>(Object.entries(importedWorld.pages || {}));
        if (autoSaveTimeoutRef.current !== null) {
          window.clearTimeout(autoSaveTimeoutRef.current);
          autoSaveTimeoutRef.current = null;
        }
        latestWorldRef.current = importedWorld;
        lastSerializedRef.current = JSON.stringify(importedWorld);
        setCurrentWorld(importedWorld);
        setPages(importedPages);
        const fallbackPageId = importedPages.size > 0 ? importedPages.keys().next().value : null;
        setCurrentPageId(importedWorld.currentPageId ?? fallbackPageId ?? null);
        setPageHistory(importedWorld.pageHistory || []);
        if (importedPages.size > 0) {
          setAutoSaveInfo({ status: 'saved', timestamp: importedWorld.lastModified || Date.now() });
        } else {
          setAutoSaveInfo({ status: 'idle' });
        }
        toast.success(`World "${importedWorld.name}" imported successfully!`);
      })
      .catch((error) => {
        toast.error(error.message);
      })
      .finally(() => {
        setIsLoading(false);
        // Reset the file input
        event.target.value = '';
      });
  }, [setPages, setCurrentPageId, setPageHistory, setIsLoading]);

  return {
    currentWorld,
    setCurrentWorld,
    autoSaveInfo,
    handleLoadWorld,
    handleNewWorld,
    handleImportWorld,
    performAutoSave,
    isEditingWorldName,
    setIsEditingWorldName,
    editedWorldName,
    setEditedWorldName
  };
}