import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Save, FolderOpen, Trash2, FileText, AlertCircle, Download, Upload } from 'lucide-react';
import { worldPersistence, SavedWorld } from '../lib/worldPersistence';
import { WikiPageData } from './WikiGenerator';
import { World, exportWorld } from './WorldModel';
import { toast } from 'sonner';

interface WorldManagerProps {
  currentWorld: World;
  pages: Map<string, WikiPageData>;
  pageImages?: Map<string, string>;
  onLoadWorld: (pages: Map<string, WikiPageData>, currentPageId: string | null, pageHistory: string[], world: World, pageImages?: Map<string, string>) => void;
  onNewWorld: () => void;
  onImportWorld?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading?: boolean;
  variant?: 'inline' | 'welcome';
}

export function WorldManager({ currentWorld, pages, pageImages, onLoadWorld, onNewWorld, onImportWorld, isLoading: parentLoading = false, variant = 'inline' }: WorldManagerProps) {
  const [savedWorlds, setSavedWorlds] = useState<SavedWorld[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [storageStats, setStorageStats] = useState(worldPersistence.getStorageStats());

  // Load saved worlds on mount and refresh storage stats
  useEffect(() => {
    refreshWorldsList();
  }, []);

  const refreshWorldsList = () => {
    setSavedWorlds(worldPersistence.getSavedWorlds());
    setStorageStats(worldPersistence.getStorageStats());
  };

  const handleSaveWorld = async () => {
    if (pages.size === 0) {
      toast.error('No pages to save');
      return;
    }

    setIsLoading(true);

    // Check if world with this name already exists
    const existingWorld = savedWorlds.find(world => world.name === currentWorld.name);

    const success = worldPersistence.saveNamedWorld(currentWorld.name, pages, currentWorld, pageImages);

    if (success) {
      refreshWorldsList();
      if (existingWorld) {
        toast.success(`World "${currentWorld.name}" updated`);
      } else {
        toast.success(`World "${currentWorld.name}" saved for this session`);
      }
    } else {
      toast.error('Failed to save world. Storage might be full.');
    }
    setIsLoading(false);
  };

  const handleLoadWorld = async (worldId: string) => {
    setIsLoading(true);
    const worldState = worldPersistence.loadNamedWorld(worldId);

    if (worldState) {
      const pagesMap = new Map(worldState.pages);
      const imagesMap = worldState.pageImages ? new Map(worldState.pageImages) : undefined;
      onLoadWorld(pagesMap, worldState.currentPageId, worldState.pageHistory, worldState.currentWorld, imagesMap);
      setIsDialogOpen(false);
      toast.success(`World "${worldState.currentWorld.name}" loaded`);
    } else {
      toast.error('Failed to load world. It may be corrupted.');
    }
    setIsLoading(false);
  };

  const handleExportWorld = async (worldId: string, worldName: string) => {
    setIsLoading(true);
    try {
      const worldState = worldPersistence.loadNamedWorld(worldId);
      if (worldState) {
        exportWorld(worldState.currentWorld);
        toast.success(`World "${worldName}" exported - world attributes only, not individual pages`);
      } else {
        toast.error('Failed to load world for export');
      }
    } catch (error) {
      toast.error('Failed to export world');
    }
    setIsLoading(false);
  };

  const handleDeleteWorld = (worldId: string, worldName: string) => {
    if (confirm(`Delete "${worldName}"? This cannot be undone.`)) {
      worldPersistence.deleteWorld(worldId);
      refreshWorldsList();
      toast.success(`World "${worldName}" deleted`);
    }
  };

  const handleNewWorld = () => {
    if (pages.size > 0) {
      if (confirm('Start a new world? Your current progress will remain saved.')) {
        onNewWorld();
        setIsDialogOpen(false);
      }
    } else {
      onNewWorld();
      setIsDialogOpen(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  const formatStorageSize = (bytes: number) => {
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)}KB`;
    return `${Math.round(kb / 1024)}MB`;
  };

  if (variant === 'welcome') {
    return (
      <div className="space-y-3">
        {/* Save Current World */}
        {pages.size > 0 && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
              onClick={handleSaveWorld}
              disabled={isLoading}
            >
              <Save className="mr-2 h-3 w-3" />
              {isLoading ? 'Saving world...' : 'Save world'}
            </Button>
          </div>
        )}

        {/* Load/Manage Worlds */}
        <div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
              >
                <FolderOpen className="mr-2 h-3 w-3" />
                Manage worlds
              </Button>
            </DialogTrigger>
          <DialogContent className="bg-glass-bg border-glass-divider max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-glass-text">World Manager</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Storage Stats */}
              <div className="text-xs text-glass-sidebar space-y-1">
                <div className="flex justify-between">
                  <span>Storage used:</span>
                  <span>{formatStorageSize(storageStats.used)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Saved worlds:</span>
                  <span>{storageStats.worldCount}</span>
                </div>
              </div>

              {/* New World */}
              <Button
                onClick={handleNewWorld}
                variant="outline"
                className="w-full justify-start border-glass-divider"
                disabled={isLoading}
              >
                <FileText className="mr-2 h-4 w-4" />
                Start New World
              </Button>

              {/* Saved Worlds List */}
              <div className="space-y-2 max-h-60 overflow-auto">
                {savedWorlds.length === 0 ? (
                  <div className="text-center py-8 text-glass-sidebar">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No saved worlds yet</p>
                    <p className="text-xs mt-1">Generate some pages and save your first world</p>
                  </div>
                ) : (
                  savedWorlds.map((world) => (
                    <div
                      key={world.id}
                      className="group border border-glass-divider rounded-lg p-3 hover:bg-glass-divider/20 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-glass-text truncate">
                            {world.name}
                          </div>
                          <div className="text-xs text-glass-sidebar mt-1 truncate">
                            {world.preview}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-glass-sidebar">
                            <span>{world.pageCount} pages</span>
                            <span>{formatDate(world.lastModified)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 ml-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleLoadWorld(world.id)}
                            disabled={isLoading}
                            className="h-8 w-8 p-0 text-glass-sidebar hover:text-glass-text"
                            title="Load world"
                          >
                            <FolderOpen className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleExportWorld(world.id, world.name)}
                            disabled={isLoading}
                            className="h-8 w-8 p-0 text-glass-sidebar hover:text-glass-accent"
                            title="Export world"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteWorld(world.id, world.name)}
                            disabled={isLoading}
                            className="h-8 w-8 p-0 text-glass-sidebar hover:text-red-400"
                            title="Delete world"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Storage Warning */}
              {storageStats.used > storageStats.available * 0.8 && (
                <div className="text-xs text-orange-400 bg-orange-400/10 border border-orange-400/20 rounded p-2">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  Storage space running low. Consider deleting old worlds.
                </div>
              )}
            </div>
          </DialogContent>
          </Dialog>
        </div>

        {/* Import World */}
        {onImportWorld && (
          <div>
            <input
              type="file"
              accept=".json"
              onChange={onImportWorld}
              className="hidden"
              id="import-world-welcome"
              disabled={parentLoading}
            />
            <label htmlFor="import-world-welcome">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
                disabled={parentLoading}
                asChild
              >
                <span>
                  <Upload className="mr-2 h-3 w-3" />
                  Import world attributes
                </span>
              </Button>
            </label>
          </div>
        )}
      </div>
    );
  }

  // Inline variant for sidebar
  return (
    <div className="flex items-center gap-1">
      {/* Save Current World */}
      {pages.size > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-glass-sidebar hover:text-glass-text"
          onClick={handleSaveWorld}
          disabled={isLoading}
          title={isLoading ? 'Saving...' : 'Save world'}
        >
          <Save className="h-4 w-4" />
        </Button>
      )}

      {/* Load/Manage Worlds */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-glass-sidebar hover:text-glass-text relative"
            title="Manage worlds"
          >
            <FolderOpen className="h-4 w-4" />
            {savedWorlds.length > 0 && (
              <Badge
                variant="secondary"
                className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs flex items-center justify-center bg-glass-accent text-glass-bg rounded-full"
              >
                {savedWorlds.length}
              </Badge>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-glass-bg border-glass-divider max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-glass-text">World Manager</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Storage Stats */}
            <div className="text-xs text-glass-sidebar space-y-1">
              <div className="flex justify-between">
                <span>Storage used:</span>
                <span>{formatStorageSize(storageStats.used)}</span>
              </div>
              <div className="flex justify-between">
                <span>Saved worlds:</span>
                <span>{storageStats.worldCount}</span>
              </div>
            </div>

            {/* New World */}
            <Button
              onClick={handleNewWorld}
              variant="outline"
              className="w-full justify-start border-glass-divider"
              disabled={isLoading}
            >
              <FileText className="mr-2 h-4 w-4" />
              Start New World
            </Button>

            {/* Saved Worlds List */}
            <div className="space-y-2 max-h-60 overflow-auto">
              {savedWorlds.length === 0 ? (
                <div className="text-center py-8 text-glass-sidebar">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No saved worlds yet</p>
                  <p className="text-xs mt-1">Generate some pages and save your first world</p>
                </div>
              ) : (
                savedWorlds.map((world) => (
                  <div
                    key={world.id}
                    className="group border border-glass-divider rounded-lg p-3 hover:bg-glass-divider/20 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-glass-text truncate">
                          {world.name}
                        </div>
                        <div className="text-xs text-glass-sidebar mt-1 truncate">
                          {world.preview}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-glass-sidebar">
                          <span>{world.pageCount} pages</span>
                          <span>{formatDate(world.lastModified)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleLoadWorld(world.id)}
                          disabled={isLoading}
                          className="h-8 w-8 p-0 text-glass-sidebar hover:text-glass-text"
                          title="Load world"
                        >
                          <FolderOpen className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleExportWorld(world.id, world.name)}
                          disabled={isLoading}
                          className="h-8 w-8 p-0 text-glass-sidebar hover:text-glass-accent"
                          title="Export world"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteWorld(world.id, world.name)}
                          disabled={isLoading}
                          className="h-8 w-8 p-0 text-glass-sidebar hover:text-red-400"
                          title="Delete world"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Storage Warning */}
            {storageStats.used > storageStats.available * 0.8 && (
              <div className="text-xs text-orange-400 bg-orange-400/10 border border-orange-400/20 rounded p-2">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                Storage space running low. Consider deleting old worlds.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}