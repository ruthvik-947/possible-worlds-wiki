import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Copy, Check, ExternalLink, Loader2, Share } from 'lucide-react';
import { toast } from 'sonner';
import { World } from './WorldModel';
import { useAuth } from '@clerk/clerk-react';
import { config } from '../lib/config';

interface ShareWorldDialogProps {
  world: World;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SharedWorldInfo {
  shareId: string;
  shareSlug: string;
  shareUrl: string;
}

export function ShareWorldDialog({ world, isOpen, onOpenChange }: ShareWorldDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [sharedWorld, setSharedWorld] = useState<SharedWorldInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const { getToken } = useAuth();

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSharedWorld(null);
      setCopied(false);
      // TODO: Check if this world is already shared and load existing share info
    }
  }, [isOpen]);

  const generateShareUrl = async () => {
    if (!world || isGenerating) return;

    setIsGenerating(true);

    try {
      const token = await getToken({ skipCache: true });
      if (!token) {
        toast.error('Please sign in to share worlds');
        return;
      }

      const response = await fetch(`${config.endpoints.worlds}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          worldId: world.id,
          worldSnapshot: world
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create share URL');
      }

      if (response.headers.get('x-streaming') === 'true') {
        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response reader available');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.status === 'success') {
                  setSharedWorld({
                    shareId: data.shareId,
                    shareSlug: data.shareSlug,
                    shareUrl: data.shareUrl
                  });
                  toast.success('Share URL created successfully!');
                } else if (data.status === 'error') {
                  throw new Error(data.message || 'Failed to create share URL');
                }
              } catch (parseError) {
                console.error('Error parsing streaming data:', parseError);
              }
            }
          }
        }
      } else {
        // Handle regular JSON response
        const data = await response.json();
        setSharedWorld({
          shareId: data.shareId,
          shareSlug: data.shareSlug,
          shareUrl: data.shareUrl
        });
        toast.success('Share URL created successfully!');
      }

    } catch (error: any) {
      console.error('Failed to create share URL:', error);
      toast.error(error.message || 'Failed to create share URL');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!sharedWorld) return;

    try {
      await navigator.clipboard.writeText(sharedWorld.shareUrl);
      setCopied(true);
      toast.success('Share URL copied to clipboard!');

      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const openInNewTab = () => {
    if (!sharedWorld) return;
    window.open(sharedWorld.shareUrl, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md glass-panel border-glass-divider !bg-glass-bg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-glass-text font-serif">
            <Share className="h-5 w-5" />
            Share "{world.name}"
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!sharedWorld ? (
            // Generate Share URL Section
            <div className="space-y-3">
              <div className="text-sm text-glass-sidebar">
                Share this world so others can explore it. They'll be able to view all pages
                and worldbuilding context, but any changes they make will be in their own copy.
              </div>

              <Button
                onClick={generateShareUrl}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Share URL...
                  </>
                ) : (
                  <>
                    <Share className="mr-2 h-4 w-4" />
                    Create Share URL
                  </>
                )}
              </Button>
            </div>
          ) : (
            // Share URL Created Section
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium text-glass-text">Share URL</div>
                <div className="flex items-center space-x-2">
                  <Input
                    value={sharedWorld.shareUrl}
                    readOnly
                    className="font-mono text-sm bg-glass-divider/20 border-glass-divider"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyToClipboard}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openInNewTab}
                    className="shrink-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}