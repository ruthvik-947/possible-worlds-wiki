import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter 
} from './ui/dialog';
import { Key, CheckCircle, AlertCircle, Loader } from 'lucide-react';

interface ApiKeyDialogProps {
  onApiKeySet: (apiKey: string, sessionId: string) => void;
  isApiKeyValid: boolean;
  isLoading?: boolean;
}

export function ApiKeyDialog({ onApiKeySet, isApiKeyValid, isLoading = false }: ApiKeyDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = () => {
    if (!apiKey.trim()) {
      setValidationError('Please enter an API key');
      return;
    }

    // Generate a simple session ID
    const sessionId = Math.random().toString(36).substr(2, 9);
    
    onApiKeySet(apiKey, sessionId);
    setIsOpen(false);
    setApiKey('');
    setValidationError(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`flex items-center gap-2 ${
            isApiKeyValid 
              ? 'border-green-500 text-green-600 hover:bg-green-50' 
              : 'border-orange-500 text-orange-600 hover:bg-orange-50'
          }`}
        >
          {isApiKeyValid ? (
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
             />
            <p className="text-xs text-glass-sidebar">
              Your API key is stored temporarily and will be forgotten when you close the browser.
            </p>
          </div>

          {validationError && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              {validationError}
            </div>
          )}

          {isApiKeyValid && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle className="h-4 w-4" />
              API key is valid and ready to use
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="border-glass-divider text-glass-text hover:bg-glass-divider/30"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!apiKey.trim()}
            className="bg-glass-text hover:bg-glass-text/90 text-glass-bg"
          >
            Set API Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 