import { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import { toast } from 'sonner';
import { WikiPage } from './WikiPage';
import { WikiPageData } from './WikiGenerator';
import { About } from './About';
import { Toaster } from 'sonner';
import { useAuth } from '@clerk/clerk-react';
import { NavigationBar } from './NavigationBar';
import { WelcomeScreen } from './WelcomeScreen';
import { WikiSidebar } from './WikiSidebar';
import { ShareWorldDialog } from './ShareWorldDialog';
import { AuthPromptDialog } from './AuthPromptDialog';
import { useApiKeyManagement } from '../hooks/useApiKeyManagement';
import { useWorldManagement } from '../hooks/useWorldManagement';
import { usePageGeneration } from '../hooks/usePageGeneration';
import { World } from './WorldModel';
import type { SharedWorldData } from '../lib/sharedWorldService';

interface WikiInterfaceProps {
  initialWorld?: World;
  sharedWorldMetadata?: SharedWorldData['metadata'];
  readOnlyMode?: boolean;
  onCopyWorld?: () => void;
  onBackToHome?: () => void;
  shareSlug?: string;
}

export function WikiInterface({
  initialWorld,
  sharedWorldMetadata,
  readOnlyMode = false,
  onCopyWorld,
  onBackToHome,
  shareSlug
}: WikiInterfaceProps = {}) {
  const [pages, setPages] = useState<Map<string, WikiPageData>>(new Map());
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [seedSentence, setSeedSentence] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [currentUsageInfo, setCurrentUsageInfo] = useState<any>(null);
  const [showAbout, setShowAbout] = useState<boolean>(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState<boolean>(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState<boolean>(false);
  const [authPromptAction, setAuthPromptAction] = useState<string>('');
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth(); // Used in hooks

  // Custom hooks
  const apiKeyManagement = useApiKeyManagement();
  const worldManagement = useWorldManagement(
    pages,
    currentPageId,
    pageHistory,
    apiKeyManagement.requireAuthToken,
    setPages,
    setCurrentPageId,
    setPageHistory,
    () => {} // setIsLoading will be handled in page generation hook
  );
  const pageGeneration = usePageGeneration(
    pages,
    setPages,
    worldManagement.currentWorld,
    worldManagement.setCurrentWorld,
    currentPageId,
    setCurrentPageId,
    pageHistory,
    setPageHistory,
    apiKeyManagement.requireAuthToken,
    apiKeyManagement.showApiKeyRequiredToast,
    apiKeyManagement.enableUserApiKeys,
    setCurrentUsageInfo,
    worldManagement.performAutoSave
  );

  // Load dark mode preference and set initial sidebar state
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setIsDarkMode(savedDarkMode);
    document.documentElement.classList.toggle('dark', savedDarkMode);

    // Set sidebar open state based on screen size
    setIsSidebarOpen(window.innerWidth >= 1024);
  }, []);

  // Load initial world for shared world viewing
  useEffect(() => {
    if (initialWorld) {
      worldManagement.setCurrentWorld(initialWorld);

      // Set up the pages
      const pagesMap = new Map(Object.entries(initialWorld.pages || {}));
      setPages(pagesMap);

      // Set current page (first page if available)
      if (initialWorld.currentPageId) {
        setCurrentPageId(initialWorld.currentPageId);
      } else if (pagesMap.size > 0) {
        const firstPageId = pagesMap.keys().next().value;
        setCurrentPageId(firstPageId || null);
      }

      // Set page history
      setPageHistory(initialWorld.pageHistory || []);
    }
  }, [initialWorld, worldManagement.setCurrentWorld, setPages, setCurrentPageId, setPageHistory]);

  const handleUpgradeRequested = () => {
    if (apiKeyManagement.enableUserApiKeys) {
      apiKeyManagement.setIsApiDialogOpen(true);
    } else {
      toast.info('Sign up or sign in first to set your API key.', {
        duration: 8000
      });
    }
  };

  const handleApiKeyStored = () => {
    setCurrentUsageInfo(null);
    apiKeyManagement.handleApiKeyStored();
  };

  const handleApiKeyRemoved = () => {
    setCurrentUsageInfo(null);
    apiKeyManagement.handleApiKeyRemoved();
  };

  const handleHome = () => {
    // If user is not signed in and in read-only mode, show auth prompt
    if (!isSignedIn && readOnlyMode) {
      handleAuthPrompt('access home');
      return;
    }
    worldManagement.handleNewWorld();
    setSeedSentence('');
  };

  const handleShareWorld = () => {
    if (!isSignedIn) {
      toast.error('Please sign in to share worlds');
      return;
    }
    setIsShareDialogOpen(true);
  };

  const handleAuthPrompt = (action: string) => {
    setAuthPromptAction(action);
    setShowAuthPrompt(true);
  };

  const handleGenerateWithAuth = (term: string, context: string) => {
    // Check if page already exists (for navigation in read-only mode)
    const existingPageId = Array.from(pages.keys()).find(id =>
      pages.get(id)?.title.toLowerCase() === term.toLowerCase()
    );

    if (existingPageId) {
      // Navigate to existing page (allowed in read-only mode)
      if (currentPageId) {
        setPageHistory(prev => [...prev, currentPageId]);
      }
      setCurrentPageId(existingPageId);
      return;
    }

    // Only block new page generation in read-only mode
    if (!isSignedIn && readOnlyMode) {
      handleAuthPrompt('generate new pages');
      return;
    }

    if (pageGeneration.handleTermClick) {
      pageGeneration.handleTermClick(term, context);
    }
  };

  const handleAddSectionWithAuth = (pageId: string, section: any) => {
    if (!isSignedIn && readOnlyMode) {
      handleAuthPrompt('add new sections');
      return;
    }
    if (pageGeneration.handleSectionAdded) {
      pageGeneration.handleSectionAdded(pageId, section);
    }
  };

  const handleGenerateImageWithAuth = (pageId: string, imageUrl: string) => {
    if (!isSignedIn && readOnlyMode) {
      handleAuthPrompt('generate images');
      return;
    }
    if (pageGeneration.handleImageGenerated) {
      pageGeneration.handleImageGenerated(pageId, imageUrl);
    }
  };

  const handleGenerateFirstPage = () => pageGeneration.generateFirstPageWithSeed(seedSentence);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (currentPage) {
      // We're in an existing world - search within it
      pageGeneration.handleTermClick(searchQuery.trim(), currentPage.content);
    } else {
      // We're on the welcome screen - create a new world with search term
      pageGeneration.generateFirstPageWithSeed(searchQuery.trim());
    }

    setSearchQuery('');
  };

  const currentPage = currentPageId ? pages.get(currentPageId) : null;


  // Show About page if requested
  if (showAbout) {
    return <About onBack={() => setShowAbout(false)} />;
  }

  return (
    <div className="min-h-screen bg-glass-bg">
      <NavigationBar
        currentPage={currentPage || null}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearch={handleSearch}
        onHome={handleHome}
        enableUserApiKeys={apiKeyManagement.enableUserApiKeys}
        hasUserApiKey={apiKeyManagement.hasUserApiKey}
        onApiDialogOpen={() => apiKeyManagement.setIsApiDialogOpen(true)}
        onShowAbout={() => setShowAbout(true)}
      />

      <div className="pt-16 max-w-screen-2xl mx-auto flex min-h-[calc(100vh-4rem)]">
        {!currentPage ? (
          <WelcomeScreen
            seedSentence={seedSentence}
            setSeedSentence={setSeedSentence}
            isLoading={pageGeneration.isLoading}
            errorMessage={pageGeneration.errorMessage}
            enableUserApiKeys={apiKeyManagement.enableUserApiKeys}
            hasUserApiKey={apiKeyManagement.hasUserApiKey}
            isApiDialogOpen={apiKeyManagement.isApiDialogOpen}
            setIsApiDialogOpen={apiKeyManagement.setIsApiDialogOpen}
            onApiKeyStored={handleApiKeyStored}
            onApiKeyRemoved={handleApiKeyRemoved}
            onGenerateFirstPage={handleGenerateFirstPage}
            currentWorld={worldManagement.currentWorld}
            onLoadWorld={worldManagement.handleLoadWorld}
            onNewWorld={worldManagement.handleNewWorld}
            onImportWorld={worldManagement.handleImportWorld}
            autoSaveInfo={worldManagement.autoSaveInfo}
            onShowAbout={() => setShowAbout(true)}
          />
        ) : (
          <>
            {/* Backdrop for mobile sidebar */}
            {isSidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                onClick={() => setIsSidebarOpen(false)}
              ></div>
            )}

            <WikiSidebar
              isSidebarOpen={isSidebarOpen}
              pages={pages}
              currentPageId={currentPageId}
              searchQuery={searchQuery}
              currentWorld={worldManagement.currentWorld}
              setCurrentWorld={(world: World) => worldManagement.setCurrentWorld(world)}
              autoSaveInfo={worldManagement.autoSaveInfo}
              enableUserApiKeys={apiKeyManagement.enableUserApiKeys}
              hasUserApiKey={apiKeyManagement.hasUserApiKey}
              currentUsageInfo={currentUsageInfo}
              onNavigateToPage={(pageId: string) => {
                if (currentPageId) {
                  setPageHistory(prev => [...prev, currentPageId]);
                }
                setCurrentPageId(pageId);
                // Only close sidebar on mobile (screen sizes below lg)
                if (window.innerWidth < 1024) {
                  setIsSidebarOpen(false);
                }
              }}
              onUpgradeRequested={handleUpgradeRequested}
              onLoadWorld={worldManagement.handleLoadWorld}
              onNewWorld={worldManagement.handleNewWorld}
              onImportWorld={worldManagement.handleImportWorld}
              onAutoSave={worldManagement.performAutoSave}
              onShareWorld={readOnlyMode ? undefined : handleShareWorld}
              readOnlyMode={readOnlyMode}
              sharedWorldMetadata={sharedWorldMetadata}
              onCopyWorld={onCopyWorld}
            />

            {/* Main Content Area */}
            <div className={`flex-1 relative transition-all duration-300 ease-in-out ${
              isSidebarOpen ? 'lg:ml-[280px]' : 'lg:ml-0'
            }`}>
              {pageGeneration.isLoading && !pageGeneration.streamingPageData && (
                <div className="fixed inset-0 glass-panel flex items-center justify-center z-50">
                  <div className="text-center">
                    <Loader className="h-8 w-8 animate-spin text-glass-accent mx-auto mb-4" />
                    <p className="text-glass-sidebar">
                      {pageGeneration.isStreaming ? 'Building world...' : 'Initializing generation...'}
                    </p>
                  </div>
                </div>
              )}
              <WikiPage
                page={pageGeneration.streamingPageData || currentPage}
                onTermClick={readOnlyMode ? handleGenerateWithAuth : pageGeneration.handleTermClick}
                worldbuildingHistory={worldManagement.currentWorld.worldbuilding}
                enableUserApiKeys={apiKeyManagement.enableUserApiKeys}
                isStreaming={pageGeneration.isStreaming}
                streamingData={pageGeneration.streamingPageData}
                onUsageUpdate={setCurrentUsageInfo}
                generatedImageUrl={currentPage?.imageUrl || undefined}
                onImageGenerated={readOnlyMode ? handleGenerateImageWithAuth : pageGeneration.handleImageGenerated}
                onSectionAdded={readOnlyMode ? handleAddSectionWithAuth : pageGeneration.handleSectionAdded}
                worldId={worldManagement.currentWorld.id}
                readOnlyMode={readOnlyMode}
                sharedWorldMetadata={sharedWorldMetadata}
                onCopyWorld={onCopyWorld}
              />
            </div>
          </>
        )}
      </div>

      <Toaster position="bottom-right" theme={isDarkMode ? 'dark' : 'light'} />

      {/* API Key Dialog - Available globally when user API keys are enabled */}
      {apiKeyManagement.enableUserApiKeys && (
        // This will be rendered by the NavigationBar or WelcomeScreen components
        null
      )}

      {/* Share World Dialog */}
      <ShareWorldDialog
        world={worldManagement.currentWorld}
        isOpen={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
      />

      {/* Authentication Prompt Dialog */}
      <AuthPromptDialog
        isOpen={showAuthPrompt}
        onOpenChange={setShowAuthPrompt}
        action={authPromptAction}
        onCopyWorld={onCopyWorld}
        sharedWorldMetadata={sharedWorldMetadata}
      />
    </div>
  );
}