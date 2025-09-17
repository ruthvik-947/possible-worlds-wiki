import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Save, FolderOpen, Trash2, FileText, AlertCircle, Download, Upload, RefreshCw } from 'lucide-react';
import { World, exportWorld, updateWorldMetadata } from './WorldModel';
import { toast } from 'sonner';
import {
  fetchWorldSummaries,
  fetchWorldById,
  saveWorldToServer,
  deleteWorldFromServer,
  RemoteWorldSummary
} from '../lib/worldService';

interface WorldManagerProps {
  currentWorld: World;
  onLoadWorld: (world: World) => void;
  onNewWorld: () => void;
  onImportWorld?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading?: boolean;
  variant?: 'inline' | 'welcome';
}

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 48) return 'Yesterday';
  return date.toLocaleDateString();
};

export function WorldManager({
  currentWorld,
  onLoadWorld,
  onNewWorld,
  onImportWorld,
  isLoading: parentLoading = false,
  variant = 'inline'
}: WorldManagerProps) {
  const [savedWorlds, setSavedWorlds] = useState<RemoteWorldSummary[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const { isLoaded: isAuthLoaded, isSignedIn, getToken } = useAuth();

  const requireAuthToken = useCallback(async () => {
    const token = await getToken({ skipCache: true });
    if (!token) {
      throw new Error('Please sign in again to manage your worlds.');
    }
    return token;
  }, [getToken]);

  const refreshWorldsList = useCallback(async () => {
    if (!isAuthLoaded || !isSignedIn) {
      setSavedWorlds([]);
      return;
    }

    setIsWorking(true);
    try {
      const token = await requireAuthToken();
      const worlds = await fetchWorldSummaries(token);
      setSavedWorlds(worlds);
    } catch (error) {
      console.error('Failed to load worlds:', error);
      toast.error('Failed to load your saved worlds.');
    } finally {
      setIsWorking(false);
    }
  }, [isAuthLoaded, isSignedIn, requireAuthToken]);

  useEffect(() => {
    refreshWorldsList();
  }, [refreshWorldsList]);

  const handleSaveWorld = async () => {
    const pageCount = Object.keys(currentWorld.pages || {}).length;
    if (pageCount === 0) {
      toast.error('No pages to save yet. Generate or add a page first.');
      return;
    }

    setIsWorking(true);
    try {
      const token = await requireAuthToken();
      const updatedWorld = updateWorldMetadata({
        ...currentWorld,
        lastModified: Date.now()
      });

      await saveWorldToServer(token, updatedWorld);
      toast.success(`World "${updatedWorld.name}" saved to your account`);
      onLoadWorld(updatedWorld);
      await refreshWorldsList();
    } catch (error: any) {
      console.error('Failed to save world:', error);
      toast.error(error?.message || 'Failed to save world.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleLoadWorld = async (worldId: string) => {
    setIsWorking(true);
    try {
      const token = await requireAuthToken();
      const record = await fetchWorldById(token, worldId);
      onLoadWorld(record.world);
      setIsDialogOpen(false);
      toast.success(`World "${record.world.name}" loaded`);
    } catch (error: any) {
      console.error('Failed to load world:', error);
      toast.error(error?.message || 'Failed to load world.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleExportWorld = async (worldId: string, worldName: string) => {
    setIsWorking(true);
    try {
      const token = await requireAuthToken();
      const record = await fetchWorldById(token, worldId);
      exportWorld(record.world);
      toast.success(`World "${worldName}" exported`);
    } catch (error: any) {
      console.error('Failed to export world:', error);
      toast.error(error?.message || 'Failed to export world.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleDeleteWorld = async (worldId: string, worldName: string) => {
    if (!confirm(`Delete "${worldName}"? This cannot be undone.`)) {
      return;
    }

    setIsWorking(true);
    try {
      const token = await requireAuthToken();
      await deleteWorldFromServer(token, worldId);
      toast.success(`World "${worldName}" deleted`);
      await refreshWorldsList();
    } catch (error: any) {
      console.error('Failed to delete world:', error);
      toast.error(error?.message || 'Failed to delete world.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleNewWorld = () => {
    const pageCount = Object.keys(currentWorld.pages || {}).length;
    if (pageCount > 0) {
      if (confirm('Start a new world? Your current progress will remain saved once you store it.')) {
        onNewWorld();
        setIsDialogOpen(false);
      }
    } else {
      onNewWorld();
      setIsDialogOpen(false);
    }
  };

  const totalPages = Object.keys(currentWorld.pages || {}).length;
  const effectiveLoading = parentLoading || isWorking;

  const renderWorldsList = () => (
    <div className="space-y-3">
      {savedWorlds.length === 0 ? (
        <div className="text-sm text-glass-sidebar bg-glass-divider/20 border border-glass-divider rounded p-3 text-center">
          No saved worlds yet. 
        </div>
      ) : (
        savedWorlds.map(world => (
          <div
            key={world.worldId}
            className="border border-glass-divider rounded-lg p-3 flex items-center justify-between bg-glass-bg/60"
          >
            <div>
              <div className="font-medium text-glass-text">
                {world.name || 'Untitled World'}
              </div>
              <div className="text-xs text-glass-sidebar space-x-2">
                <span>{formatDate(world.updatedAt)}</span>
                <span>•</span>
                <span>{world.pageCount} {world.pageCount === 1 ? 'page' : 'pages'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleLoadWorld(world.worldId)}
                disabled={effectiveLoading}
              >
                Load
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleExportWorld(world.worldId, world.name)}
                disabled={effectiveLoading}
              >
                <Download className="h-3 w-3 mr-1" />
                Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-500"
                onClick={() => handleDeleteWorld(world.worldId, world.name)}
                disabled={effectiveLoading}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const managerContent = (
    <div className="space-y-4">

      {/* <Button
        onClick={handleNewWorld}
        variant="outline"
        className="w-full justify-start border-glass-divider"
        disabled={effectiveLoading}
      >
        <FileText className="mr-2 h-4 w-4" />
        Start New World
      </Button> */}

      {/* {onImportWorld && (
        <div>
          <input
            type="file"
            accept=".json"
            onChange={onImportWorld}
            className="hidden"
            id="import-world"
            disabled={effectiveLoading}
          />
          <label
            htmlFor="import-world"
            className="flex items-center text-sm text-glass-sidebar hover:text-glass-text underline underline-offset-2 transition-colors cursor-pointer"
          >
            <Upload className="mr-2 h-3 w-3" />
            Import world
          </label>
        </div>
      )} */}

      <div className="space-y-2">
        
        
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase text-glass-sidebar tracking-wide">Saved Worlds</div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-glass-sidebar hover:text-glass-text"
            onClick={refreshWorldsList}
            disabled={effectiveLoading}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {renderWorldsList()}
      </div>
    </div>
  );

  if (variant === 'welcome') {
    return (
      <div className="space-y-3">
        {totalPages > 0 && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
              onClick={handleSaveWorld}
              disabled={effectiveLoading}
            >
              <Save className="mr-2 h-3 w-3" />
              {effectiveLoading ? 'Saving world...' : 'Save world'}
            </Button>
          </div>
        )}

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
              {managerContent}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-glass-sidebar tracking-[0.28em]">World</div>
          <div className="flex items-center gap-2">
            <h2 className="text-glass-text font-serif text-lg font-medium">{currentWorld.name}</h2>
            <Badge variant="secondary" className="bg-glass-divider/40 text-glass-sidebar">
              {totalPages} {totalPages === 1 ? 'page' : 'pages'}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveWorld}
            disabled={effectiveLoading || totalPages === 0}
            className="border-glass-divider"
          >
            <Save className="mr-2 h-3 w-3" />
            {effectiveLoading ? 'Saving...' : 'Save world'}
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-glass-sidebar hover:text-glass-text">
                <FolderOpen className="mr-2 h-3 w-3" />
                Manage
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-glass-bg border-glass-divider max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-glass-text">World Manager</DialogTitle>
              </DialogHeader>
              {managerContent}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs text-glass-sidebar">
          Last saved: {currentWorld.lastModified ? formatDate(currentWorld.lastModified) : 'never'}
        </div>
      </div>
    </div>
  );
}
