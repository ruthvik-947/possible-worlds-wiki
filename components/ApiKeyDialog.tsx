import { useState, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter 
} from './ui/dialog';
import { Key, CheckCircle, AlertCircle, Loader, Trash2 } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { config } from '../lib/config';

interface ApiKeyDialogProps {
  hasApiKey: boolean;
  onStored: () => void;
  onRemoved: () => void;
  isLoading?: boolean;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ApiKeyDialog({ hasApiKey, onStored, onRemoved, isLoading = false, trigger, open, onOpenChange }: ApiKeyDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { getToken } = useAuth();

  // Use controlled state if provided, otherwise use internal state
  const dialogOpen = open !== undefined ? open : isOpen;
  const setDialogOpen = onOpenChange || setIsOpen;

  const submitKey = async () => {
    if (!apiKey.trim()) {
      setValidationError('Please enter an API key');
      return;
    }

    try {
      setIsSubmitting(true);
      setValidationError(null);
      const token = await getToken({ skipCache: true });
      if (!token) {
        throw new Error('Unable to retrieve authentication token');
      }

      const response = await fetch(config.endpoints.storeKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ apiKey })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to store API key');
      }

      onStored();
      setDialogOpen(false);
      setApiKey('');
    } catch (error: any) {
      setValidationError(error?.message || 'Failed to store API key');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    submitKey();
  };

  const handleRemove = async () => {
    try {
      setIsSubmitting(true);
      const token = await getToken({ skipCache: true });
      if (!token) {
        throw new Error('Unable to retrieve authentication token');
      }

      const response = await fetch(config.endpoints.storeKey, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to remove API key');
      }

      onRemoved();
      setApiKey('');
      setValidationError(null);
    } catch (error: any) {
      setValidationError(error?.message || 'Failed to remove API key');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className={`flex items-center gap-2 ${
              hasApiKey
                ? 'border-green-500 text-green-600 hover:bg-green-50'
                : 'border-orange-500 text-orange-600 hover:bg-orange-50'
            }`}
          >
            {hasApiKey ? (
              <>
                <CheckCircle className="h-4 w-4" />
                API Key Set
              </>
            ) : (
              <>
                <Key className="h-4 w-4" />
                Set API Key
              </>
            )}
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md glass-panel border-glass-divider !bg-glass-bg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-glass-text">
            <Key className="h-5 w-5" />
            OpenAI API Key
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="api-key" className="text-sm font-medium text-glass-text">
              Enter your <a href="https://platform.openai.com/api-keys" target="_blank" className="text-blue-600 hover:text-blue-700 underline">OpenAI API key</a>
            </label>
            <Input
              id="api-key"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyPress={handleKeyPress}
              className="font-mono text-sm bg-glass-bg/50 border-glass-divider focus:border-glass-accent text-glass-text"
              disabled={isSubmitting || isLoading}
            />
            <p className="text-xs text-glass-sidebar">
              Stored securely for 3 days (encrypted in database). Will persist across sessions.
            </p>
          </div>

          {validationError && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              {validationError}
            </div>
          )}

          {hasApiKey && !validationError && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle className="h-4 w-4" />
              API key is set for this account
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          {hasApiKey ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleRemove}
              disabled={isSubmitting || isLoading}
              className="text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              {isSubmitting ? <Loader className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove Key
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-glass-divider text-glass-text hover:bg-glass-divider/30"
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!apiKey.trim() || isSubmitting || isLoading}
            className="bg-glass-text hover:bg-glass-text/90 text-glass-bg flex items-center gap-2"
          >
            {isSubmitting ? <Loader className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
            {hasApiKey ? 'Replace Key' : 'Set API Key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
