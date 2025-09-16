import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ArrowLeft, Home, Search, Loader, Download, Upload, Menu, Sun, Moon } from 'lucide-react';
import { WikiPage } from './WikiPage';
import { generateWikiPage, WikiPageData } from './WikiGenerator';
import { ApiKeyDialog } from './ApiKeyDialog';
import { UsageIndicator } from './UsageIndicator';
import { 
  WorldbuildingRecord, 
  createEmptyWorldbuildingRecord, 
  updateWorldbuildingHistory,
  exportWorldbuildingRecord,
  importWorldbuildingRecord
} from './WorldbuildingHistory';
import { config } from '../lib/config';

export function WikiInterface() {
  const [pages, setPages] = useState<Map<string, WikiPageData>>(new Map());
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [seedSentence, setSeedSentence] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [worldbuildingHistory, setWorldbuildingHistory] = useState<WorldbuildingRecord>(createEmptyWorldbuildingRecord());
  const [importError, setImportError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [enableUserApiKeys, setEnableUserApiKeys] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [currentUsageInfo, setCurrentUsageInfo] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingPageData, setStreamingPageData] = useState<WikiPageData | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  // Check configuration on mount
  useEffect(() => {
    fetch(config.endpoints.config)
      .then(res => res.json())
      .then(configData => setEnableUserApiKeys(configData.enableUserApiKeys))
      .catch(err => console.error('Failed to fetch config:', err));
  }, []);

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

  const handleApiKeySet = (key: string, newSessionId: string) => {
    setApiKey(key);
    setSessionId(newSessionId);
  };

  const handleExportWorldbuilding = () => {
    const totalEntries = Object.values(worldbuildingHistory).reduce((total, group) => 
      total + Object.values(group).reduce((sum: number, entries) => sum + (entries as string[]).length, 0), 0
    );
    
    if (totalEntries === 0) {
      alert('No worldbuilding data to export. Generate some pages first!');
      return;
    }
    
    exportWorldbuildingRecord(worldbuildingHistory);
  };

  const handleImportWorldbuilding = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setIsLoading(true);

    importWorldbuildingRecord(file)
      .then((importedRecord) => {
        setWorldbuildingHistory(importedRecord);
        setPages(new Map()); // Clear existing pages
        setCurrentPageId(null);
        setPageHistory([]);
        setSeedSentence('');
        alert('Worldbuilding record imported successfully! You can now start generating new pages with this context.');
      })
      .catch((error) => {
        setImportError(error.message);
        alert(`Import failed: ${error.message}`);
      })
      .finally(() => {
        setIsLoading(false);
        // Reset the file input
        event.target.value = '';
      });
  };


  const handleGenerateFirstPage = async () => {
    if (!seedSentence.trim()) return;
    if (enableUserApiKeys && !sessionId) {
      alert('Please set your API key first before generating content.');
      return;
    }
    setIsLoading(true);
    setIsStreaming(true);
    setErrorMessage(null);
    setStreamingPageData(null);

    try {
      const firstPage = await generateWikiPage(
        seedSentence,
        'seed',
        undefined,
        worldbuildingHistory,
        enableUserApiKeys ? sessionId : undefined,
        // Streaming callback
        (partialData: WikiPageData) => {
          console.log('WikiInterface: Received streaming data:', partialData);
          setStreamingPageData(partialData);
        }
      );

      // Update usage info from response
      if (firstPage.usageInfo) {
        setCurrentUsageInfo(firstPage.usageInfo);
      }

      // Update worldbuilding history with the new page
      const updatedHistory = updateWorldbuildingHistory(
        worldbuildingHistory,
        firstPage.categories,
        firstPage.content,
        firstPage.title
      );

      const newPages = new Map([[firstPage.id, firstPage]]);

      setPages(newPages);
      setCurrentPageId(firstPage.id);
      setPageHistory([firstPage.id]);
      setWorldbuildingHistory(updatedHistory);
      setStreamingPageData(null); // Clear streaming data when complete
    } catch (error: any) {
      console.error('Error generating first page:', error);
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        setErrorMessage(error.message);
        if (error.usageInfo) {
          setCurrentUsageInfo(error.usageInfo);
        }
      } else if (error.code === 'API_KEY_REQUIRED') {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to generate wiki page. Please try again.');
      }
      setStreamingPageData(null);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleTermClick = async (term: string, context: string) => {
    if (enableUserApiKeys && !sessionId) {
      alert('Please set your API key first before generating content.');
      return;
    }

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
      const newPage = await generateWikiPage(
        term,
        'term',
        context,
        worldbuildingHistory,
        enableUserApiKeys ? sessionId : undefined,
        // Streaming callback
        (partialData: WikiPageData) => {
          console.log('WikiInterface: Received streaming data:', partialData);
          setStreamingPageData(partialData);
        }
      );

      // Update usage info from response
      if (newPage.usageInfo) {
        setCurrentUsageInfo(newPage.usageInfo);
      }

      // Update worldbuilding history with the new page
      const updatedHistory = updateWorldbuildingHistory(
        worldbuildingHistory,
        newPage.categories,
        newPage.content,
        newPage.title
      );

      const newPages = new Map(pages);
      newPages.set(newPage.id, newPage);

      setPages(newPages);
      setWorldbuildingHistory(updatedHistory);
      navigateToPage(newPage.id);
      setStreamingPageData(null); // Clear streaming data when complete
    } catch (error: any) {
      console.error('Error generating page:', error);
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        setErrorMessage(error.message);
        if (error.usageInfo) {
          setCurrentUsageInfo(error.usageInfo);
        }
      } else if (error.code === 'API_KEY_REQUIRED') {
        setErrorMessage(error.message);
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
    if (pageHistory.length > 0) {
      setCurrentPageId(pageHistory[0]);
      setPageHistory([]);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && currentPage) {
      handleTermClick(searchQuery.trim(), currentPage.content);
      setSearchQuery('');
    }
  };

  const currentPage = currentPageId ? pages.get(currentPageId) : null;

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
            <h1 className="text-2xl font-serif font-medium text-glass-bg tracking-wide">
              PWW
            </h1>
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
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleDarkMode}
              className="text-glass-bg hover:bg-glass-bg/10 h-8 w-8 p-0"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {/* <Button
              variant="ghost"
              size="sm"
              className="text-glass-bg hover:bg-glass-bg/10 h-8 w-8 p-0"
            >
              <Menu className="h-4 w-4" />
            </Button> */}
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
                  PossibleWorldWiki
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
                <CardContent className="space-y-6 flex flex-col items-center">
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
                  
                  {!enableUserApiKeys && (
                    <div className="w-full">
                      <UsageIndicator
                        sessionId={sessionId}
                        usageInfo={currentUsageInfo}
                        onUpgradeRequested={() => {
                          // Show upgrade message or guide user to enable API keys
                          alert('To get unlimited usage, enable user API keys in your environment configuration and provide your own OpenAI API key.');
                        }}
                      />
                    </div>
                  )}
                  
                  <div className="flex gap-3 w-full">
                    {enableUserApiKeys && (
                      <ApiKeyDialog
                        onApiKeySet={handleApiKeySet}
                        isApiKeyValid={!!sessionId}
                        isLoading={isLoading}
                      />
                    )}
                    <Button
                      onClick={handleGenerateFirstPage}
                      disabled={!seedSentence.trim() || isLoading || (enableUserApiKeys && !sessionId)}
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
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportWorldbuilding}
                      className="hidden"
                      id="import-worldbuilding"
                      disabled={isLoading}
                    />
                    <label htmlFor="import-worldbuilding">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-sm text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
                        disabled={isLoading}
                        asChild
                      >
                        <span>
                          <Upload className="mr-2 h-3 w-3" />
                          Import existing world
                        </span>
                      </Button>
                    </label>
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
              <div className="p-6 border-b border-glass-divider flex-shrink-0">
                <div className="flex items-center gap-2 mb-6">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    disabled={pageHistory.length === 0}
                    className="h-8 w-8 p-0 text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleHome}
                    disabled={pageHistory.length === 0}
                    className="h-8 w-8 p-0 text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
                  >
                    <Home className="h-4 w-4" />
                  </Button>
                </div>

                <form onSubmit={handleSearch} className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-glass-sidebar" />
                  <Input
                    placeholder="Search pages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10 border-glass-divider focus:border-glass-accent bg-glass-bg"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="ghost"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </form>
              </div>

              <div className="flex-1 p-6 flex flex-col min-h-0">
                {!enableUserApiKeys && (
                  <div className="mb-4">
                    <UsageIndicator
                      sessionId={sessionId}
                      usageInfo={currentUsageInfo}
                      onUpgradeRequested={() => {
                        alert('To get unlimited usage, enable user API keys in your environment configuration and provide your own OpenAI API key.');
                      }}
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
                          setIsSidebarOpen(false);
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
                  <h3 className="font-serif text-lg font-medium text-glass-text mb-4">Worldbuilding</h3>
                  
                  {/* Worldbuilding Stats */}
                  <div className="text-xs space-y-2 mb-4 font-mono">
                    {Object.entries(worldbuildingHistory).map(([group, categories]) => (
                      <div key={group}>
                        {Object.entries(categories).map(([category, entries]) => {
                          if ((entries as string[]).length > 0) {
                            return (
                              <div key={category} className="text-glass-sidebar">
                                <span className="font-medium">{category}:</span> {(entries as string[]).length} entries
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Export/Import Buttons */}
                  <div className="space-y-3">
                    <button
                      onClick={handleExportWorldbuilding}
                      className="flex items-center text-sm text-glass-sidebar hover:text-glass-text underline underline-offset-2 transition-colors cursor-pointer"
                    >
                      <Download className="mr-2 h-3 w-3" />
                      Export World
                    </button>
                    <div>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportWorldbuilding}
                        className="hidden"
                        id="import-worldbuilding-sidebar"
                        disabled={isLoading}
                      />
                      <label
                        htmlFor="import-worldbuilding-sidebar"
                        className="flex items-center text-sm text-glass-sidebar hover:text-glass-text underline underline-offset-2 transition-colors cursor-pointer"
                      >
                        <Upload className="mr-2 h-3 w-3" />
                        Import World
                      </label>
                    </div>
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
                      {isStreaming ? 'Preparing to stream content...' : 'Initializing generation...'}
                    </p>
                  </div>
                </div>
              )}
              <WikiPage
                page={streamingPageData || currentPage}
                onTermClick={handleTermClick}
                worldbuildingHistory={worldbuildingHistory}
                sessionId={enableUserApiKeys ? sessionId : undefined}
                enableUserApiKeys={enableUserApiKeys}
                isStreaming={isStreaming}
                streamingData={streamingPageData}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
