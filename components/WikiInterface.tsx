import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ArrowLeft, Home, Search, Loader, Download, Upload } from 'lucide-react';
import { WikiPage } from './WikiPage';
import { generateWikiPage, WikiPageData } from './WikiGenerator';
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
    setIsLoading(true);
    try {
      const firstPage = await generateWikiPage(seedSentence, 'seed', undefined, worldbuildingHistory);
      
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
      const newPage = await generateWikiPage(term, 'term', context, worldbuildingHistory);
      
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
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top navigation */}
      <header className="bg-card border-b border-border px-6 py-4">
        <h1 className="text-2xl font-semibold">PossibleWorldWikis</h1>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {!currentPage ? (
          <div className="max-w-4xl mx-auto p-6 overflow-auto">
            <div className="text-center py-12">
              {/* <h2 className="text-3xl mb-4">Possible World Wikis</h2> */}
              {/* <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                Enter a sentence about your fictional world to begin. 
              </p> */}

              <Card className="max-w-2xl mx-auto">
                <CardHeader>
                  <CardTitle>Seed Your World</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder=""
                    value={seedSentence}
                    onChange={(e) => setSeedSentence(e.target.value)}
                    className="text-base"
                  />
                  <Button
                    onClick={handleGenerateFirstPage}
                    disabled={!seedSentence.trim() || isLoading}
                    className="w-full"
                  >
                    {isLoading ? (
                      <>
                        <Loader className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      'Generate Wiki'
                    )}
                  </Button>
                  
                  <div className="pt-4 border-t">
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
                        className="w-full text-xs text-muted-foreground hover:text-foreground"
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
            {/* Sidebar */}
            <div className="w-64 bg-card border-r border-border flex flex-col overflow-auto">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2 mb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    disabled={pageHistory.length === 0}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleHome}
                    disabled={pageHistory.length === 0}
                  >
                    <Home className="size-4" />
                  </Button>

                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search pages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="flex-1 p-4">
                <h3 className="text-sm font-medium mb-3">Contents</h3>
                <div className="space-y-2">
                  {(searchQuery ? filteredPages : Array.from(pages.values())).map(page => (
                    <Button
                      key={page.id}
                      variant={currentPageId === page.id ? "secondary" : "ghost"}
                      className="w-full justify-start text-left h-auto p-3"
                      onClick={() => navigateToPage(page.id)}
                    >
                      <div>
                        <div className="font-medium text-sm truncate">
                          {page.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {page.content.substring(0, 80)}...
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-auto relative">
              {isLoading && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                  <Loader className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
              <WikiPage
                page={currentPage}
                onTermClick={handleTermClick}
                worldbuildingHistory={worldbuildingHistory}
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
      </main>
    </div>
  );
}
