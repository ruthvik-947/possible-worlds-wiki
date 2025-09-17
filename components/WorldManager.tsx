import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { FolderOpen, Trash2, FileText, AlertCircle, Download, Upload, RefreshCw } from 'lucide-react';
import { World, exportWorld } from './WorldModel';
import { toast } from 'sonner';
import {
  fetchWorldSummaries,
  fetchWorldById,
  deleteWorldFromServer,
  RemoteWorldSummary
} from '../lib/worldService';

export interface AutoSaveInfo {
  status: 'idle' | 'saving' | 'saved' | 'error';
  timestamp?: number;
  error?: string;
}

interface WorldManagerProps {
  currentWorld: World;
  onLoadWorld: (world: World) => void;
  onNewWorld: () => void;
  onImportWorld?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading?: boolean;
  variant?: 'inline' | 'welcome';
  autoSaveInfo?: AutoSaveInfo;
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

const formatRelativeTime = (timestamp: number) => {
  const diffMs = Date.now() - timestamp;
  if (diffMs < 5000) return 'just now';
  if (diffMs < 60000) return `${Math.max(1, Math.round(diffMs / 1000))}s ago`;
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)}h ago`;
  return formatDate(timestamp);
};

export function WorldManager({
  currentWorld,
  onLoadWorld,
  onNewWorld,
  onImportWorld,
  isLoading: parentLoading = false,
  variant = 'inline',
  autoSaveInfo
}: WorldManagerProps) {
  const [savedWorlds, setSavedWorlds] = useState<RemoteWorldSummary[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const { isLoaded: isAuthLoaded, isSignedIn, getToken } = useAuth();
  const lastAutoSaveError = useRef<string | null>(null);

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

  useEffect(() => {
    if (autoSaveInfo?.status === 'saved' && autoSaveInfo.timestamp) {
      refreshWorldsList();
    }
  }, [autoSaveInfo?.status, autoSaveInfo?.timestamp, refreshWorldsList]);

  useEffect(() => {
    if (autoSaveInfo?.status === 'error' && autoSaveInfo.error) {
      if (autoSaveInfo.error !== lastAutoSaveError.current) {
        lastAutoSaveError.current = autoSaveInfo.error;
        toast.error(autoSaveInfo.error);
      }
    } else {
      lastAutoSaveError.current = null;
    }
  }, [autoSaveInfo?.status, autoSaveInfo?.error]);

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
  const autoSaveStatus = autoSaveInfo?.status ?? 'idle';
  const autoSaveMessage = (() => {
    if (totalPages === 0) {
      return 'Auto-save activates once you add pages to this world.';
    }
    switch (autoSaveStatus) {
      case 'saving':
        return 'Saving changes…';
      case 'saved':
        return autoSaveInfo?.timestamp ? `Saved ${formatRelativeTime(autoSaveInfo.timestamp)}` : 'Saved.';
      case 'error':
        return 'Auto-save failed. We will retry shortly.';
      default:
        return 'Auto-save ready.';
    }
  })();
  const autoSaveClass = autoSaveStatus === 'error'
    ? 'text-red-400'
    : autoSaveStatus === 'saving'
      ? 'text-glass-text'
      : 'text-glass-sidebar';

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
        {/* <div className={`text-xs ${autoSaveClass} bg-glass-divider/20 border border-glass-divider rounded px-2 py-1`}>
          {autoSaveMessage}
        </div> */}

        <div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-glass-sidebar hover:text-glass-text hover:bg-glass-divider/30"
              >
                <FolderOpen className="mr-2 h-3 w-3" />
                {/* Manage worlds */}
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
        <div className="flex items-center gap-3">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-glass-sidebar hover:text-glass-text">
                <FolderOpen className="mr-2 h-3 w-3" />
                {/* Manage */}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-glass-bg border-glass-divider max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-glass-text">World Manager</DialogTitle>
              </DialogHeader>
              {managerContent}
            </DialogContent>
          </Dialog>
          {/* <span className={`text-xs ${autoSaveClass}`}>{autoSaveMessage}</span> */}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs text-glass-sidebar">
          Last saved: {
            autoSaveInfo?.timestamp
              ? formatDate(autoSaveInfo.timestamp)
              : currentWorld.lastModified
                ? formatDate(currentWorld.lastModified)
                : 'never'
          }
        </div>
      </div>
    </div>
  );
}
