import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ArrowLeft, Home, Search, Loader, Download, Upload, Menu, Sun } from 'lucide-react';
import { WikiPage } from './WikiPage';
import { generateWikiPage, WikiPageData } from './WikiGenerator';
import { ApiKeyDialog } from './ApiKeyDialog';
import { 
  WorldbuildingRecord, 
  createEmptyWorldbuildingRecord, 
  updateWorldbuildingHistory,
  exportWorldbuildingRecord,
  importWorldbuildingRecord
} from './WorldbuildingHistory';

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

  // Check configuration on mount
  useEffect(() => {
    fetch('http://localhost:3001/api/config')
      .then(res => res.json())
      .then(config => setEnableUserApiKeys(config.enableUserApiKeys))
      .catch(err => console.error('Failed to fetch config:', err));
  }, []);

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
    try {
      const firstPage = await generateWikiPage(seedSentence, 'seed', undefined, worldbuildingHistory, enableUserApiKeys ? sessionId : undefined);
      
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
    } finally {
      setIsLoading(false);
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
    try {
      const newPage = await generateWikiPage(term, 'term', context, worldbuildingHistory, enableUserApiKeys ? sessionId : undefined);
      
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
    } finally {
      setIsLoading(false);
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

  const filteredPages = Array.from(pages.values()).filter(page =>
    page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    page.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentPage = currentPageId ? pages.get(currentPageId) : null;

  return (
    <div className="min-h-screen bg-glass-bg">
      {/* Fixed Top Navigation - Glass Minimalism Style */}
      <nav className="fixed top-0 left-0 right-0 bg-glass-text z-50 h-16">
        <div className="max-w-screen-2xl mx-auto px-6 h-full flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <h1 className="text-2xl font-serif font-medium text-glass-bg tracking-wide">
              PWW
            </h1>
          </div>

          {/* Center Search Bar */}
          {/* <div className="flex-1 max-w-md mx-8">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-glass-sidebar" />
              <Input
                placeholder="Search the wiki..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 bg-glass-bg/10 border-glass-divider/30 text-glass-bg placeholder:text-glass-sidebar/70 rounded-full backdrop-blur-sm focus:bg-glass-bg/20 transition-colors"
              />
            </div>
          </div> */}

          {/* Right Menu */}
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-glass-bg hover:bg-glass-bg/10 h-8 w-8 p-0"
            >
              <Sun className="h-4 w-4" />
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

      <div className="pt-16 max-w-screen-2xl mx-auto flex min-h-screen">
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
            {/* Left Sidebar - 280px fixed width */}
            <aside className="w-280 bg-glass-bg border-r border-glass-divider flex flex-col">
              <div className="p-6 border-b border-glass-divider">
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

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-glass-sidebar" />
                  <Input
                    placeholder="Search pages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 border-glass-divider focus:border-glass-accent bg-glass-bg"
                  />
                </div>
              </div>

              <div className="flex-1 p-6 overflow-auto">
                <h3 className="font-serif text-lg font-medium text-glass-text mb-4">Contents</h3>
                <div className="space-y-2">
                  {(searchQuery ? filteredPages : Array.from(pages.values())).map(page => (
                    <Button
                      key={page.id}
                      variant="ghost"
                      className={`w-full justify-start text-left h-auto p-4 rounded-lg transition-all duration-200 ${
                        currentPageId === page.id 
                          ? "bg-glass-accent/10 text-glass-accent border border-glass-accent/20" 
                          : "text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
                      }`}
                      onClick={() => navigateToPage(page.id)}
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

              {/* Bottom export/import section */}
              <div className="p-6 border-t border-glass-divider">
                <div className="space-y-3">
                  <Button
                    onClick={handleExportWorldbuilding}
                    variant="ghost"
                    size="sm"
                    className="w-full text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export World
                  </Button>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportWorldbuilding}
                    className="hidden"
                    id="import-sidebar"
                    disabled={isLoading}
                  />
                  <label htmlFor="import-sidebar">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
                      disabled={isLoading}
                      asChild
                    >
                      <span>
                        <Upload className="mr-2 h-4 w-4" />
                        Import World
                      </span>
                    </Button>
                  </label>
                </div>
              </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 relative">
              {isLoading && (
                <div className="absolute inset-0 glass-panel flex items-center justify-center z-10">
                  <div className="text-center">
                    <Loader className="h-8 w-8 animate-spin text-glass-accent mx-auto mb-4" />
                    <p className="text-glass-sidebar">Generating content...</p>
                  </div>
                </div>
              )}
              <WikiPage
                page={currentPage}
                onTermClick={handleTermClick}
                worldbuildingHistory={worldbuildingHistory}
                sessionId={enableUserApiKeys ? sessionId : undefined}
                enableUserApiKeys={enableUserApiKeys}
                onWorldbuildingImport={(importedRecord) => {
                  setWorldbuildingHistory(importedRecord);
                  setPages(new Map()); // Clear existing pages
                  setCurrentPageId(null);
                  setPageHistory([]);
                  setSeedSentence('');
                  alert('Worldbuilding record imported successfully! You can now start generating new pages with this context.');
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
