import { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import { WikiInterface } from './WikiInterface';
import { getSharedWorld, copySharedWorld } from '../lib/sharedWorldService';
import { generateWorldId } from './WorldModel';
import { useAuth } from '@clerk/clerk-react';
import { toast } from 'sonner';
import type { World } from './WorldModel';
import type { SharedWorldData } from '../lib/sharedWorldService';
import * as Sentry from '@sentry/react';

interface SharedWorldViewProps {
  shareSlug: string;
  onBackToHome: () => void;
}

interface ShareViewState {
  loading: boolean;
  error: string | null;
  sharedWorldData: SharedWorldData | null;
  copiedWorld: World | null;
}

export function SharedWorldView({ shareSlug, onBackToHome }: SharedWorldViewProps) {
  const [state, setState] = useState<ShareViewState>({
    loading: true,
    error: null,
    sharedWorldData: null,
    copiedWorld: null
  });
  const { isSignedIn, getToken } = useAuth();

  // Load the shared world on mount
  useEffect(() => {
    const loadSharedWorld = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        const sharedWorldData = await getSharedWorld(shareSlug);
        setState(prev => ({ ...prev, loading: false, sharedWorldData }));
      } catch (error: any) {
        if (import.meta.env.PROD) {
          Sentry.captureException(error, {
            tags: {
              operation: 'load_shared_world',
              shareSlug: shareSlug
            }
          });
        } else {
          console.error('Failed to load shared world:', error);
        }
        setState(prev => ({
          ...prev,
          loading: false,
          error: error.message || 'Failed to load shared world'
        }));
      }
    };

    loadSharedWorld();
  }, [shareSlug]);

  const handleCopyWorld = async () => {
    if (!isSignedIn || !state.sharedWorldData) {
      toast.error('Please sign in to copy this world');
      return;
    }

    try {
      const token = await getToken({ skipCache: true });
      if (!token) {
        toast.error('Authentication required to copy world');
        return;
      }

      const newWorldId = generateWorldId();
      const result = await copySharedWorld(token, shareSlug, newWorldId);

      setState(prev => ({ ...prev, copiedWorld: result.copiedWorld }));
      toast.success('World copied to your account!');
    } catch (error: any) {
      if (import.meta.env.PROD) {
        Sentry.captureException(error, {
          tags: {
            operation: 'copy_shared_world',
            shareSlug: shareSlug
          }
        });
      } else {
        console.error('Failed to copy world:', error);
      }
      toast.error(error.message || 'Failed to copy world');
    }
  };

  // If user has copied the world, show their editable version
  if (state.copiedWorld) {
    return (
      <WikiInterface
        initialWorld={state.copiedWorld}
        onBackToHome={onBackToHome}
      />
    );
  }

  // Loading state
  if (state.loading) {
    return (
      <div className="min-h-screen bg-glass-bg flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-glass-accent mx-auto mb-4" />
          <p className="text-glass-text">Loading shared world...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (state.error) {
    return (
      <div className="min-h-screen bg-glass-bg flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-serif text-glass-text mb-2">World Not Found</h1>
          <p className="text-glass-sidebar mb-6">{state.error}</p>
          <button
            onClick={onBackToHome}
            className="rounded-full bg-glass-text px-6 py-2 text-sm font-semibold text-glass-bg hover:bg-glass-text/90 transition"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Success state - show the shared world in read-only mode
  if (state.sharedWorldData) {
    return (
      <WikiInterface
        initialWorld={state.sharedWorldData.world}
        sharedWorldMetadata={state.sharedWorldData.metadata}
        readOnlyMode={true}
        onCopyWorld={handleCopyWorld}
        onBackToHome={onBackToHome}
        shareSlug={shareSlug}
      />
    );
  }

  return null;
}