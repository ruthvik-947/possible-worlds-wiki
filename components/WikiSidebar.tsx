import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Share, Copy } from 'lucide-react';
import { WorldManager, AutoSaveInfo } from './WorldManager';
import { UsageIndicator } from './UsageIndicator';
import { WikiPageData } from './WikiGenerator';
import { WorldbuildingRecord } from './WorldbuildingHistory';
import { World } from './WorldModel';

interface WikiSidebarProps {
  isSidebarOpen: boolean;
  pages: Map<string, WikiPageData>;
  currentPageId: string | null;
  searchQuery: string;
  currentWorld: World;
  setCurrentWorld: (world: World) => void;
  autoSaveInfo: AutoSaveInfo;
  enableUserApiKeys: boolean;
  hasUserApiKey: boolean;
  currentUsageInfo: any;
  onNavigateToPage: (pageId: string) => void;
  onUpgradeRequested: () => void;
  onLoadWorld: (world: World) => void;
  onNewWorld: () => void;
  onImportWorld: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onAutoSave: () => void;
  onShareWorld?: () => void;
  readOnlyMode?: boolean;
  sharedWorldMetadata?: any;
  onCopyWorld?: () => void;
}

export function WikiSidebar({
  isSidebarOpen,
  pages,
  currentPageId,
  searchQuery,
  currentWorld,
  setCurrentWorld,
  autoSaveInfo,
  enableUserApiKeys,
  hasUserApiKey,
  currentUsageInfo,
  onNavigateToPage,
  onUpgradeRequested,
  onLoadWorld,
  onNewWorld,
  onImportWorld,
  onAutoSave,
  onShareWorld,
  readOnlyMode = false,
  sharedWorldMetadata,
  onCopyWorld,
}: WikiSidebarProps) {
  const [isEditingWorldName, setIsEditingWorldName] = useState(false);
  const [editedWorldName, setEditedWorldName] = useState('');

  const filteredPages = (pages: Map<string, WikiPageData>, query: string) => {
    const searchTerm = query.toLowerCase();
    return Array.from(pages.values()).filter(page =>
      page.title.toLowerCase().includes(searchTerm) ||
      page.content.toLowerCase().includes(searchTerm)
    );
  };

  return (
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
              onUpgradeRequested={onUpgradeRequested}
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
                  onNavigateToPage(page.id);
                  // Only close sidebar on mobile (screen sizes below lg)
                  if (window.innerWidth < 1024) {
                    // Parent component should handle closing sidebar
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
                    // Trigger auto-save after world name change
                    setTimeout(() => onAutoSave(), 100);
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
                  maxLength={100}
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
                <div className="flex items-center gap-1">
                  <WorldManager
                    currentWorld={currentWorld}
                    onLoadWorld={onLoadWorld}
                    onNewWorld={onNewWorld}
                    onImportWorld={onImportWorld}
                    autoSaveInfo={autoSaveInfo}
                  />
                  {!readOnlyMode && onShareWorld ? (
                    <div title="Share World">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onShareWorld}
                        className="text-glass-sidebar hover:text-glass-accent"
                      >
                        <Share className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : readOnlyMode && onCopyWorld ? (
                    <div title="Copy World to Your Account">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onCopyWorld}
                        className="text-glass-accent hover:text-glass-accent/80"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : null}
                </div>
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

          {/* Last saved section - separated by divider */}
          <div className="border-t border-glass-divider pt-3">
            <div className="text-xs text-glass-sidebar">
              Last saved: {
                autoSaveInfo?.timestamp
                  ? (() => {
                      const diffMs = Date.now() - autoSaveInfo.timestamp;
                      if (diffMs < 5000) return 'just now';
                      if (diffMs < 60000) return `${Math.max(1, Math.round(diffMs / 1000))}s ago`;
                      if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m ago`;
                      if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)}h ago`;
                      const date = new Date(autoSaveInfo.timestamp);
                      const now = new Date();
                      const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
                      if (diffHours < 24) return `${diffHours}h ago`;
                      if (diffHours < 48) return 'Yesterday';
                      return date.toLocaleDateString();
                    })()
                  : currentWorld.lastModified
                    ? (() => {
                        const date = new Date(currentWorld.lastModified);
                        const now = new Date();
                        const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
                        if (diffHours < 1) return 'Just now';
                        if (diffHours < 24) return `${diffHours}h ago`;
                        if (diffHours < 48) return 'Yesterday';
                        return date.toLocaleDateString();
                      })()
                    : 'never'
              }
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}