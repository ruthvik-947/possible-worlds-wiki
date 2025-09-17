import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Loader, Upload, Menu, Sun, Moon, Settings, LogOut, Search } from 'lucide-react';
import { WikiPage } from './WikiPage';
import { generateWikiPage, WikiPageData } from './WikiGenerator';
import { ApiKeyDialog } from './ApiKeyDialog';
import { UsageIndicator } from './UsageIndicator';
import {
  WorldbuildingRecord,
  updateWorldbuildingHistory
} from './WorldbuildingHistory';
import {
  World,
  createNewWorld,
  updateWorldMetadata,
  importWorld,
  getWorldStats
} from './WorldModel';
import { config } from '../lib/config';
import { WorldManager, AutoSaveInfo } from './WorldManager';
import { saveWorldToServer } from '../lib/worldService';
import { Toaster, toast } from 'sonner';
import { useAuth, SignOutButton } from '@clerk/clerk-react';

export function WikiInterface() {
  const [pages, setPages] = useState<Map<string, WikiPageData>>(new Map());
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [seedSentence, setSeedSentence] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentWorld, setCurrentWorld] = useState<World>(createNewWorld());
  const [isEditingWorldName, setIsEditingWorldName] = useState(false);
  const [editedWorldName, setEditedWorldName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [enableUserApiKeys, setEnableUserApiKeys] = useState<boolean>(false);
  const [hasUserApiKey, setHasUserApiKey] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [currentUsageInfo, setCurrentUsageInfo] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingPageData, setStreamingPageData] = useState<WikiPageData | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isApiDialogOpen, setIsApiDialogOpen] = useState<boolean>(false);
  const [isHomeConfirmOpen, setIsHomeConfirmOpen] = useState<boolean>(false);
  const [autoSaveInfo, setAutoSaveInfo] = useState<AutoSaveInfo>({ status: 'idle' });
  const { isLoaded: isAuthLoaded, isSignedIn, getToken } = useAuth();
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const latestWorldRef = useRef<World>(currentWorld);
  const lastSerializedRef = useRef<string>('');

  useEffect(() => {
    setCurrentWorld(prev => ({
      ...prev,
      pages: Object.fromEntries(pages),
      currentPageId,
      pageHistory
    }));
  }, [pages, currentPageId, pageHistory]);

  useEffect(() => {
    latestWorldRef.current = {
      ...currentWorld,
      pages: Object.fromEntries(pages),
      currentPageId,
      pageHistory
    };
  }, [currentWorld, pages, currentPageId, pageHistory]);

  // Helper function to show API key required toast with link to open dialog
  const showApiKeyRequiredToast = () => {
    toast.error(
      'Please set your API key first',
      {
        description: 'Click here to open the API key dialog',
        action: {
          label: 'Set API Key',
          onClick: () => setIsApiDialogOpen(true)
        },
        duration: 5000
      }
    );
  };

  const requireAuthToken = useCallback(async () => {
    const token = await getToken({ skipCache: true });
    if (!token) {
      throw new Error('Unable to retrieve authentication token from Clerk. Please sign in again.');
    }
    return token;
  }, [getToken]);

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

    const shouldSchedule =
      serialized !== lastSerializedRef.current || autoSaveInfo.status === 'error';

    if (!shouldSchedule) {
      return;
    }

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

  // Check configuration once auth is available
  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn) {
      setHasUserApiKey(false);
      return;
    }

    let isActive = true;

    const fetchConfig = async () => {
      try {
        const token = await requireAuthToken();
        const response = await fetch(config.endpoints.config, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to load configuration (${response.status})`);
        }

        const configData = await response.json();
        if (isActive) {
          setEnableUserApiKeys(configData.enableUserApiKeys);
        }
      } catch (err) {
        console.error('Failed to fetch config:', err);
      }
    };

    fetchConfig();

    return () => {
      isActive = false;
    };
  }, [isAuthLoaded, isSignedIn, requireAuthToken]);

  // Fetch whether the user already stored an API key
  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn) {
      setHasUserApiKey(false);
      return;
    }

    let isActive = true;

    const fetchStoredKeyStatus = async () => {
      try {
        const token = await requireAuthToken();
        const response = await fetch(config.endpoints.storeKey, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to check stored API key (${response.status})`);
        }

        const data = await response.json();
        if (isActive) {
          setHasUserApiKey(Boolean(data.hasKey));
        }
      } catch (err) {
        console.error('Failed to determine stored API key status:', err);
      }
    };

    fetchStoredKeyStatus();

    return () => {
      isActive = false;
    };
  }, [isAuthLoaded, isSignedIn, requireAuthToken]);

  // Load dark mode preference and apply theme
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(savedDarkMode);
    document.documentElement.classList.toggle('dark', savedDarkMode);
  }, []);

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    localStorage.setItem('darkMode', newDarkMode.toString());
    document.documentElement.classList.toggle('dark', newDarkMode);
  };

  const handleApiKeyStored = () => {
    setHasUserApiKey(true);
    setCurrentUsageInfo(null);
    setErrorMessage(null); // Clear any error messages
    toast.success('API key saved for this session');
  };

  const handleApiKeyRemoved = () => {
    setHasUserApiKey(false);
    setCurrentUsageInfo(null);
    toast.success('API key removed');
  };

  const handleUpgradeRequested = () => {
    if (enableUserApiKeys) {
      setIsApiDialogOpen(true);
    } else {
      toast.info('To get unlimited usage, enable user API keys in your environment configuration and provide your own OpenAI API key.', {
        duration: 8000
      });
    }
  };

  const handleLoadWorld = (loadedWorld: World) => {
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
  };

  const handleNewWorld = () => {
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
    setSeedSentence('');
  };


  const handleImportWorld = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError(null);
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
        setSeedSentence('');
        if (importedPages.size > 0) {
          setAutoSaveInfo({ status: 'saved', timestamp: importedWorld.lastModified || Date.now() });
        } else {
          setAutoSaveInfo({ status: 'idle' });
        }
        // Use toast for success
        toast.success(`World "${importedWorld.name}" imported successfully!`);
      })
      .catch((error) => {
        setImportError(error.message);
        // Use toast for error with detailed message
        toast.error(error.message);
      })
      .finally(() => {
        setIsLoading(false);
        // Reset the file input
        event.target.value = '';
      });
  };



  const handleTermClick = async (term: string, context: string) => {
    // Check if page already exists
    const existingPageId = Array.from(pages.keys()).find(id =>
      pages.get(id)?.title.toLowerCase() === term.toLowerCase()
    );

    if (existingPageId) {
      navigateToPage(existingPageId);
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
  };

  const navigateToPage = (pageId: string) => {
    if (currentPageId) {
      setPageHistory(prev => [...prev, currentPageId]);
    }
    setCurrentPageId(pageId);
  };

  const handleBack = () => {
    if (pageHistory.length > 0) {
      const previousPageId = pageHistory[pageHistory.length - 1];
      setPageHistory(prev => prev.slice(0, -1));
      setCurrentPageId(previousPageId);
    }
  };

  const handleHome = () => {
    handleNewWorld();
  };

  const generateFirstPageWithSeed = async (seed: string) => {
    // Always start fresh - clear existing world state
    const newWorld = createNewWorld();
    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    latestWorldRef.current = newWorld;
    lastSerializedRef.current = JSON.stringify(newWorld);
    setAutoSaveInfo({ status: 'idle' });
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
  };

  const handleGenerateFirstPage = () => generateFirstPageWithSeed(seedSentence);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (currentPage) {
      // We're in an existing world - search within it
      handleTermClick(searchQuery.trim(), currentPage.content);
    } else {
      // We're on the welcome screen - create a new world with search term
      generateFirstPageWithSeed(searchQuery.trim());
    }

    setSearchQuery('');
  };

  const currentPage = currentPageId ? pages.get(currentPageId) : null;

  const handleImageGenerated = (pageId: string, imageUrl: string) => {
    setPages(prev => {
      const updated = new Map(prev);
      const existingPage = updated.get(pageId);
      if (existingPage) {
        updated.set(pageId, { ...existingPage, imageUrl });
      }
      return updated;
    });
  };

  const filteredPages = (pages: Map<string, WikiPageData>, query: string) => {
    const searchTerm = query.toLowerCase();
    return Array.from(pages.values()).filter(page =>
      page.title.toLowerCase().includes(searchTerm) ||
      page.content.toLowerCase().includes(searchTerm)
    );
  };

  return (
    <div className="min-h-screen bg-glass-bg">
      {/* Fixed Top Navigation - Glass Minimalism Style */}
      <nav className="fixed top-0 left-0 right-0 bg-glass-text z-50 h-16">
        <div className="max-w-screen-2xl mx-auto px-6 h-full flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            {currentPage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="text-glass-bg hover:bg-glass-bg/10 h-8 w-8 p-0 mr-4"
              >
                <Menu className="h-4 w-4" />
              </Button>
            )}
            <button
              onClick={() => setIsHomeConfirmOpen(true)}
              className="text-2xl font-serif font-medium text-glass-bg tracking-wide hover:text-glass-bg/80 transition-colors cursor-pointer"
            >
              PWW
            </button>
          </div>

          {/* Center Search Bar */}
          {currentPage && (
            <div className="flex-1 max-w-md mx-8">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-glass-sidebar" />
                <Input
                  placeholder="Search or generate new page..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 pr-12 bg-glass-bg/10 border-glass-divider/30 text-glass-text placeholder:text-glass-sidebar/70 rounded-full backdrop-blur-sm focus:bg-glass-bg/20 transition-colors"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-glass-sidebar hover:text-glass-text hover:bg-glass-bg/10 rounded-full"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </form>
            </div>
          )}

          {/* Right Menu */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleDarkMode}
              className="text-glass-bg hover:bg-glass-bg/10 h-8 w-8 p-0"
              title="Toggle theme"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {enableUserApiKeys && (
              <ApiKeyDialog
                hasApiKey={hasUserApiKey}
                onStored={handleApiKeyStored}
                onRemoved={handleApiKeyRemoved}
                isLoading={isLoading}
                open={isApiDialogOpen}
                onOpenChange={setIsApiDialogOpen}
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-glass-bg hover:bg-glass-bg/10 h-8 w-8 p-0"
                    title="Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                }
              />
            )}
            <SignOutButton signOutOptions={{ redirectUrl: '/' }}>
              <Button
                variant="ghost"
                size="sm"
                className="text-glass-bg hover:bg-glass-bg/10 h-8 w-8 p-0"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </SignOutButton>
          </div>
        </div>
      </nav>

      <div className="pt-16 max-w-screen-2xl mx-auto flex min-h-[calc(100vh-4rem)]">
        {!currentPage ? (
          /* Welcome Screen */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-2xl animate-fade-in">
              <div className="text-center mb-12">
                <h1 className="font-serif text-6xl font-medium text-glass-text mb-6 tracking-wide">
                  PossibleWorldWikis
                </h1>
                {/* <div className="w-24 h-px bg-glass-divider mx-auto mb-6"></div> */}
                {/* <p className="text-glass-sidebar text-lg leading-relaxed">
                  Enter a sentence about your fictional world to begin exploring the infinite possibilities of your imagination.
                </p> */}
              </div>

              <Card className="glass-panel">
                <CardHeader className="text-center">
                  <CardTitle className="font-sans text-l text-glass-text">
                    Seed a world with the title of its first wiki page.
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 flex flex-col">
                  <Input
                    // placeholder="In the realm of Aethros, floating cities drift through crystal clouds..."
                    value={seedSentence}
                    onChange={(e) => setSeedSentence(e.target.value)}
                    className="text-body border-glass-divider focus:border-glass-accent bg-glass-bg/50"
                  />
                  {errorMessage && (
                    <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {errorMessage}
                    </div>
                  )}
                  
                  {(!enableUserApiKeys || !hasUserApiKey) && (
                    <div className="w-full">
                      <UsageIndicator
                        usageInfo={currentUsageInfo}
                        hasUserApiKey={hasUserApiKey}
                        onUpgradeRequested={handleUpgradeRequested}
                      />
                    </div>
                  )}
                  
                  <div className="flex gap-3 w-full">
                    {enableUserApiKeys && (
                      <div className="relative">
                        <ApiKeyDialog
                          hasApiKey={hasUserApiKey}
                          onStored={handleApiKeyStored}
                          onRemoved={handleApiKeyRemoved}
                          isLoading={isLoading}
                          open={isApiDialogOpen}
                          onOpenChange={setIsApiDialogOpen}
                        />
                      </div>
                    )}
                    <Button
                      onClick={handleGenerateFirstPage}
                      disabled={!seedSentence.trim() || isLoading}
                      className={`${enableUserApiKeys ? 'flex-1' : 'w-full'} bg-glass-text hover:bg-glass-text/90 text-glass-bg font-medium py-3`}
                    >
                      {isLoading ? (
                        <>
                          <Loader className="mr-2 h-4 w-4 animate-spin" />
                          Building...
                        </>
                      ) : (
                        'Generate'
                      )}
                    </Button>
                  </div>
                  
                  <div className="pt-6 border-t border-glass-divider">
                  <WorldManager
                      currentWorld={currentWorld}
                      onLoadWorld={handleLoadWorld}
                      onNewWorld={handleNewWorld}
                      onImportWorld={handleImportWorld}
                      isLoading={isLoading}
                      variant="welcome"
                      autoSaveInfo={autoSaveInfo}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <>
            {/* Backdrop for mobile sidebar */}
            {isSidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                onClick={() => setIsSidebarOpen(false)}
              ></div>
            )}

            {/* Left Sidebar */}
            <aside
              className={`bg-glass-bg border-r border-glass-divider flex flex-col h-[calc(100vh-4rem)] overflow-hidden transition-all duration-300 ease-in-out
              fixed top-16 bottom-0 left-0 z-40 w-[280px]
              lg:fixed lg:top-16 lg:left-0 lg:bottom-0 lg:h-[calc(100vh-4rem)]
              ${isSidebarOpen ? 'translate-x-0 lg:translate-x-0 lg:w-[280px]' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:border-r-0'}`}
            >
              <div className="flex-1 p-6 flex flex-col min-h-0">
                {(!enableUserApiKeys || !hasUserApiKey) && (
                  <div className="mb-4">
                    <UsageIndicator
                      usageInfo={currentUsageInfo}
                      hasUserApiKey={hasUserApiKey}
                      onUpgradeRequested={handleUpgradeRequested}
                    />
                  </div>
                )}
                
                {/* Contents Section - Scrollable with constrained height */}
                <div className="flex flex-col flex-1 min-h-0">
                  <h3 className="font-serif text-lg font-medium text-glass-text mb-4 flex-shrink-0">Contents</h3>
                  <div className="flex-1 overflow-auto space-y-2 min-h-0 max-h-[calc(100vh-24rem)]">
                    {(searchQuery ? filteredPages(pages, searchQuery) : Array.from(pages.values())).map(page => (
                      <Button
                        key={page.id}
                        variant="ghost"
                        className={`w-full justify-start text-left h-auto p-4 rounded-lg transition-all duration-200 ${
                          currentPageId === page.id
                            ? "bg-glass-accent/10 text-glass-accent border border-glass-accent/20"
                            : "text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
                        }`}
                        onClick={() => {
                          navigateToPage(page.id);
                          // Only close sidebar on mobile (screen sizes below lg)
                          if (window.innerWidth < 1024) {
                            setIsSidebarOpen(false);
                          }
                        }}
                      >
                        <div className="w-full min-w-0">
                          <div className="font-medium text-sm mb-1 line-clamp-1 truncate">
                            {page.title}
                          </div>
                          <div className="text-xs opacity-70 line-clamp-2">
                            {page.content.substring(0, 80)}...
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
                
                {/* Worldbuilding Stats Section - Fixed at bottom */}
                <div className="border-t border-glass-divider pt-4 mt-4 flex-shrink-0">
                  <div className="flex items-center justify-between mb-4">
                    {isEditingWorldName ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editedWorldName.trim()) {
                            setCurrentWorld({
                              ...currentWorld,
                              name: editedWorldName.trim(),
                              lastModified: Date.now()
                            });
                          }
                          setIsEditingWorldName(false);
                        }}
                        className="flex items-center gap-2 flex-1"
                      >
                        <Input
                          value={editedWorldName}
                          onChange={(e) => setEditedWorldName(e.target.value)}
                          className="h-7 text-sm"
                          placeholder="World name..."
                          autoFocus
                        />
                        <Button
                          type="submit"
                          size="sm"
                          className="h-7 px-2 text-xs"
                        >
                          Save
                        </Button>
                      </form>
                    ) : (
                      <>
                        <h3
                          className="font-serif text-lg font-medium text-glass-text cursor-pointer hover:text-glass-accent flex-1 min-w-0"
                          onClick={() => {
                            setEditedWorldName(currentWorld.name);
                            setIsEditingWorldName(true);
                          }}
                          title="Click to edit world name"
                        >
                          {currentWorld.name}
                        </h3>
                        <WorldManager
                          currentWorld={currentWorld}
                          onLoadWorld={handleLoadWorld}
                          onNewWorld={handleNewWorld}
                          onImportWorld={handleImportWorld}
                          autoSaveInfo={autoSaveInfo}
                        />
                      </>
                    )}
                  </div>
                  
                  {/* Worldbuilding Stats */}
                  <div className="text-xs space-y-1 mb-4 font-mono">
                    {Object.entries(currentWorld.worldbuilding).flatMap(([group, categories]) =>
                      Object.entries(categories)
                        .filter(([, entries]) => (entries as string[]).length > 0)
                        .map(([category, entries]) => (
                          <div key={`${group}-${category}`} className="text-glass-sidebar">
                            <span className="font-medium">{category}:</span> {(entries as string[]).length} entries
                          </div>
                        ))
                    )}
                  </div>


                  {/* Import Button */}
                  <div className="pt-3 border-t border-glass-divider">
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportWorld}
                      className="hidden"
                      id="import-world-sidebar"
                      disabled={isLoading}
                    />
                    <label
                      htmlFor="import-world-sidebar"
                      className="flex items-center text-sm text-glass-sidebar hover:text-glass-text underline underline-offset-2 transition-colors cursor-pointer"
                    >
                      <Upload className="mr-2 h-3 w-3" />
                      Import world attributes
                    </label>
                  </div>
                </div>
              </div>


            </aside>

            {/* Main Content Area */}
            <div className={`flex-1 relative transition-all duration-300 ease-in-out ${
              isSidebarOpen ? 'lg:ml-[280px]' : 'lg:ml-0'
            }`}>
              {isLoading && !streamingPageData && (
                <div className="fixed inset-0 glass-panel flex items-center justify-center z-50">
                  <div className="text-center">
                    <Loader className="h-8 w-8 animate-spin text-glass-accent mx-auto mb-4" />
                    <p className="text-glass-sidebar">
                      {isStreaming ? 'Building world...' : 'Initializing generation...'}
                    </p>
                  </div>
                </div>
              )}
              <WikiPage
                page={streamingPageData || currentPage}
                onTermClick={handleTermClick}
                worldbuildingHistory={currentWorld.worldbuilding}
                enableUserApiKeys={enableUserApiKeys}
                isStreaming={isStreaming}
                streamingData={streamingPageData}
                onUsageUpdate={setCurrentUsageInfo}
                generatedImageUrl={currentPage?.imageUrl || undefined}
                onImageGenerated={handleImageGenerated}
              />
            </div>
          </>
        )}
      </div>

      {/* Home Confirmation Dialog */}
      <Dialog open={isHomeConfirmOpen} onOpenChange={setIsHomeConfirmOpen}>
        <DialogContent className="glass-panel border-glass-divider bg-glass-bg text-glass-text">
          <DialogHeader>
            <DialogTitle className="text-glass-text font-serif text-xl">Return to Welcome Screen?</DialogTitle>
            <DialogDescription className="text-glass-sidebar mt-2">
              This will clear your current world and return you to the welcome screen. Any unsaved progress will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button
              variant="ghost"
              onClick={() => setIsHomeConfirmOpen(false)}
              className="text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/20 border border-glass-divider"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setIsHomeConfirmOpen(false);
                handleHome();
              }}
              className="bg-glass-accent text-glass-bg hover:bg-glass-accent/90 font-medium"
            >
              Clear & Go Home
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster position="bottom-right" theme={isDarkMode ? 'dark' : 'light'} />
    </div>
  );
}
